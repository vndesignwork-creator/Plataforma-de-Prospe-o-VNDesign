/**
 * Regras automáticas (Definições → Regras automáticas): guardar, pré-visualizar e
 * aplicar. Correm depois de criar ou editar um lead (createLead/updateLead), no cron
 * diário (as que dependem do tempo, ex.: "parado há 21 dias") e quando se carrega em
 * "Aplicar agora". Cada regra aplica-se uma só vez a cada lead (automation_rule_runs).
 * As alterações feitas por uma regra não voltam a disparar regras (rulesRunning).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  AutomationRuleSchema,
  addDays,
  describeAction,
  ruleMatches,
  ruleUsesTime,
  todayIso,
  type AutomationRule,
  type AutomationRuleCreate,
  type LeadUpdate,
  type RuleCondition,
  type RuleLead,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { createActivity } from './activities';

const SELECT = 'id, name, enabled, conditions, actions, position, runs, last_run_at, created_at, updated_at';
const LEAD_FIELDS = 'id, number, company_name, website, email, phone, status, sector_id, city, channel, tags, status_changed_at, assigned_to';
const NOT_FOUND = 'Regra não encontrada';
const MAX_LEADS = 5000;
type Candidate = RuleLead & { id: string; number: number; company_name: string; assigned_to: string | null };

const missingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';
const notReady = () => new ApiError(503, 'Ainda não disponível', 'A base de dados ainda não foi atualizada (npx supabase db push).');
// Regras com JSON antigo/estragado ficam de fora em vez de partirem tudo.
const toRule = (row: unknown): AutomationRule | null => {
  const parsed = AutomationRuleSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
};

function assertManager(ctx: ApiContext) {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem permissão', 'Só o dono e os administradores mudam as regras automáticas.');
}

/** Dentro de uma regra a aplicar-se (as edições que ela faz não disparam outras regras). */
const rulesRunning = new AsyncLocalStorage<true>();

export async function listRules(ctx: ApiContext): Promise<AutomationRule[]> {
  const { data, error } = await ctx.supabase.from('automation_rules').select(SELECT).eq('workspace_id', ctx.workspaceId).order('position').order('created_at');
  if (missingTable(error)) return [];
  if (error) throw fromPostgrest(error);
  return (data ?? []).map(toRule).filter((r): r is AutomationRule => !!r);
}

export async function createRule(ctx: ApiContext, input: AutomationRuleCreate): Promise<AutomationRule> {
  assertManager(ctx);
  const { data: last } = await ctx.supabase.from('automation_rules').select('position').eq('workspace_id', ctx.workspaceId).order('position', { ascending: false }).limit(1);
  const result = await ctx.supabase
    .from('automation_rules')
    .insert({ ...input, workspace_id: ctx.workspaceId, position: ((last?.[0]?.position as number | undefined) ?? 0) + 1 })
    .select(SELECT)
    .single();
  if (missingTable(result.error)) throw notReady();
  return toRule(unwrap(result))!;
}

export async function updateRule(ctx: ApiContext, id: string, patch: Partial<AutomationRuleCreate>): Promise<AutomationRule> {
  assertManager(ctx);
  const update = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const result = await ctx.supabase.from('automation_rules').update(update).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).maybeSingle();
  return toRule(unwrap(result, NOT_FOUND))!;
}

export async function deleteRule(ctx: ApiContext, id: string): Promise<void> {
  assertManager(ctx);
  const { data, error } = await ctx.supabase.from('automation_rules').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
}

async function candidates(ctx: ApiContext, ids?: string[]): Promise<Candidate[]> {
  let query = ctx.supabase.from('leads').select(LEAD_FIELDS).eq('workspace_id', ctx.workspaceId).is('archived_at', null).is('anonymized_at', null);
  if (ids) query = query.in('id', ids);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(MAX_LEADS);
  if (error) throw fromPostgrest(error);
  return (data ?? []) as unknown as Candidate[];
}

/** Quantos leads cumprem agora as condições (e alguns exemplos), sem fazer nada. */
export async function previewRule(ctx: ApiContext, conditions: RuleCondition[]) {
  const now = new Date();
  const matching = (await candidates(ctx)).filter((l) => ruleMatches(conditions, l, now));
  return { count: matching.length, sample: matching.slice(0, 5).map((l) => ({ id: l.id, number: l.number, company_name: l.company_name })) };
}

/** Aplica uma regra a um lead: junta as mudanças num só update, cria a tarefa e regista na linha do tempo. */
async function applyRule(ctx: ApiContext, rule: AutomationRule, lead: Candidate): Promise<boolean> {
  // Reserva primeiro (chave rule+lead): se outro pedido já a aplicou, não repete.
  const { error: claimError } = await ctx.supabase.from('automation_rule_runs').insert({ rule_id: rule.id, workspace_id: ctx.workspaceId, lead_id: lead.id });
  if (claimError) {
    if (claimError.code === '23505') return false;
    throw fromPostgrest(claimError);
  }
  const { updateLead } = await import('./leads');
  const { createTask } = await import('./tasks');
  const today = todayIso();
  const patch: LeadUpdate = {};
  let tags = [...(lead.tags ?? [])];
  for (const a of rule.actions) {
    if (a.type === 'add_tag' && !tags.some((t) => t.toLowerCase() === a.value.toLowerCase())) tags.push(a.value);
    if (a.type === 'remove_tag') tags = tags.filter((t) => t.toLowerCase() !== a.value.toLowerCase());
    if (a.type === 'set_status' && a.value !== lead.status) patch.status = a.value;
    if (a.type === 'assign_to' && a.user_id !== lead.assigned_to) patch.assigned_to = a.user_id;
    if (a.type === 'set_next_action') {
      patch.next_action_text = a.text;
      patch.next_action_on = addDays(today, a.in_days);
    }
  }
  if (tags.join('\u0000') !== (lead.tags ?? []).join('\u0000')) patch.tags = tags;
  await rulesRunning.run(true, async () => {
    if (Object.keys(patch).length) await updateLead(ctx, lead.id, patch);
    for (const a of rule.actions) {
      if (a.type !== 'create_task') continue;
      await createTask(ctx, lead.id, { title: a.title, due_on: addDays(today, a.due_in_days), remind_at: null, assigned_to: patch.assigned_to ?? lead.assigned_to ?? null });
    }
  });
  await createActivity(ctx, lead.id, {
    type: 'note',
    body: `⚙️ Regra automática “${rule.name}”: ${rule.actions.map((a) => describeAction(a)).join('; ')}.`,
    payload: { via: 'automation', rule_id: rule.id },
  }).catch(() => undefined);
  return true;
}

async function applyRules(ctx: ApiContext, rules: AutomationRule[], leads: Candidate[]): Promise<number> {
  if (!rules.length || !leads.length) return 0;
  const now = new Date();
  // O que já foi aplicado (não repete).
  const done = new Set<string>();
  for (let i = 0; i < leads.length; i += 300) {
    const { data } = await ctx.supabase
      .from('automation_rule_runs')
      .select('rule_id, lead_id')
      .in(
        'rule_id',
        rules.map((r) => r.id),
      )
      .in(
        'lead_id',
        leads.slice(i, i + 300).map((l) => l.id),
      );
    for (const r of (data ?? []) as { rule_id: string; lead_id: string }[]) done.add(`${r.rule_id}:${r.lead_id}`);
  }
  let applied = 0;
  const counts = new Map<string, number>();
  for (const lead of leads) {
    let current = lead;
    for (const rule of rules) {
      if (done.has(`${rule.id}:${lead.id}`) || !ruleMatches(rule.conditions, current, now)) continue;
      try {
        if (!(await applyRule(ctx, rule, current))) continue;
      } catch (error) {
        console.warn('[regras] não foi possível aplicar', rule.name, error instanceof Error ? error.message : error);
        continue;
      }
      applied++;
      counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
      // As regras seguintes veem o lead já mudado.
      current = (await candidates(ctx, [lead.id]))[0] ?? current;
    }
  }
  for (const [id, n] of counts) {
    const rule = rules.find((r) => r.id === id)!;
    await ctx.supabase.from('automation_rules').update({ runs: rule.runs + n, last_run_at: new Date().toISOString() }).eq('id', id);
  }
  return applied;
}

/**
 * Depois de criar/editar um lead: aplica as regras ligadas que ele passou a cumprir.
 * Nunca falha a gravação do lead (erros só no registo). Devolve se mudou alguma coisa.
 */
export async function runRulesForLead(ctx: ApiContext, leadId: string): Promise<boolean> {
  if (rulesRunning.getStore()) return false;
  try {
    const rules = (await listRules(ctx)).filter((r) => r.enabled);
    if (!rules.length) return false;
    return (await applyRules(ctx, rules, await candidates(ctx, [leadId]))) > 0;
  } catch (error) {
    console.warn('[regras] ao gravar o lead', error instanceof Error ? error.message : error);
    return false;
  }
}

/** "Aplicar agora": a regra a todos os leads que a cumprem hoje (e ainda não a tiveram). */
export async function runRuleNow(ctx: ApiContext, id: string): Promise<{ applied: number }> {
  assertManager(ctx);
  const rule = (await listRules(ctx)).find((r) => r.id === id);
  if (!rule) throw new ApiError(404, NOT_FOUND);
  return { applied: await applyRules(ctx, [rule], await candidates(ctx)) };
}

/** Cron diário: as regras ligadas que dependem do tempo ("parado há N dias"), em todos os workspaces. */
export async function runTimedRules(options: { dryRun?: boolean } = {}): Promise<{ workspaces: number; applied: number }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('automation_rules').select(`workspace_id, ${SELECT}`).eq('enabled', true);
  if (missingTable(error)) return { workspaces: 0, applied: 0 };
  if (error) throw new Error(error.message);
  const byWorkspace = new Map<string, AutomationRule[]>();
  for (const row of (data ?? []) as ({ workspace_id: string } & Record<string, unknown>)[]) {
    const rule = toRule(row);
    if (!rule || !ruleUsesTime(rule.conditions)) continue;
    byWorkspace.set(row.workspace_id, [...(byWorkspace.get(row.workspace_id) ?? []), rule]);
  }
  let applied = 0;
  if (options.dryRun) return { workspaces: byWorkspace.size, applied };
  for (const [workspaceId, rules] of byWorkspace) {
    const ctx = await systemContext(workspaceId, null);
    if (!ctx) continue;
    applied += await applyRules(ctx, rules, await candidates(ctx));
  }
  return { workspaces: byWorkspace.size, applied };
}
