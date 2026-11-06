/**
 * Renovações e avenças de cada cliente (domínio, alojamento, manutenção…): lista,
 * "Renovado" (passa à data seguinte e regista o pagamento), receita recorrente e o
 * aviso do cron diário uns dias antes de cada data (tarefa + aviso no sino).
 */
import {
  RENEWAL_KIND_LABELS,
  RENEWAL_PERIOD_LABELS,
  WorkspaceSettingsSchema,
  formatDate,
  leadPath,
  nextRenewalDate,
  renewalMonthly,
  renewalPrice,
  todayIso,
  type RecurringSummary,
  type Renewal,
  type RenewalCreate,
  type RenewalKind,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { createActivity } from './activities';
import { getLead } from './leads';
import { createPayment } from './payments';
import { saveAlert } from './push';
import { getSettings } from './workspace';

const SELECT = 'id, lead_id, kind, title, amount, period, next_due_on, remind_days, active, notes, reminded_for, created_at, updated_at';
const NOT_FOUND = 'Renovação não encontrada';
type Row = Omit<Renewal, 'amount'> & { amount: number | string };
const toRenewal = (r: Row): Renewal => ({ ...r, amount: Number(r.amount) });
const missingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';
const notReady = () => new ApiError(503, 'Ainda não disponível', 'A base de dados ainda não foi atualizada (npx supabase db push).');

export async function listRenewals(ctx: ApiContext, leadId: string): Promise<Renewal[]> {
  const { data, error } = await ctx.supabase
    .from('client_renewals')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('active', { ascending: false })
    .order('next_due_on');
  // Antes da migração 20261108002600: lista vazia.
  if (missingTable(error)) return [];
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map(toRenewal);
}

export async function createRenewal(ctx: ApiContext, leadId: string, input: RenewalCreate): Promise<Renewal> {
  await getLead(ctx, leadId);
  const result = await ctx.supabase
    .from('client_renewals')
    .insert({ ...input, workspace_id: ctx.workspaceId, lead_id: leadId })
    .select(SELECT)
    .single();
  if (missingTable(result.error)) throw notReady();
  return toRenewal(unwrap(result) as Row);
}

export async function updateRenewal(ctx: ApiContext, id: string, patch: Partial<RenewalCreate>): Promise<Renewal> {
  const update: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  // Data nova: volta a avisar para essa data.
  if (patch.next_due_on) update.reminded_for = null;
  const result = await ctx.supabase.from('client_renewals').update(update).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).maybeSingle();
  return toRenewal(unwrap(result, NOT_FOUND) as Row);
}

export async function deleteRenewal(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('client_renewals').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
}

/** "Renovado": passa à data seguinte; com record_payment (e os Pagamentos ligados) regista o pagamento de hoje. */
export async function renewRenewal(ctx: ApiContext, id: string, options: { record_payment: boolean }): Promise<Renewal> {
  const current = toRenewal(
    unwrap(await ctx.supabase.from('client_renewals').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(), NOT_FOUND) as Row,
  );
  const next = nextRenewalDate(current.next_due_on, current.period);
  const settings = await getSettings(ctx);
  if (options.record_payment && settings.features.payments && current.amount > 0) {
    await createPayment(ctx, current.lead_id, {
      description: `${current.title} (${RENEWAL_PERIOD_LABELS[current.period].toLowerCase()}, até ${formatDate(next)})`.slice(0, 200),
      amount: current.amount,
      due_on: current.next_due_on,
      paid_on: todayIso(),
      method: null,
    });
  }
  const saved = toRenewal(
    unwrap(
      await ctx.supabase.from('client_renewals').update({ next_due_on: next, reminded_for: null }).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).single(),
    ) as Row,
  );
  await createActivity(ctx, current.lead_id, {
    type: 'note',
    body: `🔁 Renovado: ${current.title} (${renewalPrice(current.amount, current.period)}). Próxima: ${formatDate(next)}.`,
    payload: { via: 'renewal', renewal_id: id },
  }).catch(() => undefined);
  return saved;
}

/** Receita recorrente: o que entra por mês e as próximas renovações (60 dias). */
export async function recurringSummary(ctx: ApiContext): Promise<RecurringSummary> {
  const empty: RecurringSummary = { monthly: 0, yearly: 0, active: 0, clients: 0, by_kind: [], upcoming: [] };
  const { data, error } = await ctx.supabase.from('client_renewals').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('active', true).order('next_due_on').limit(2000);
  if (missingTable(error)) return empty;
  if (error) throw fromPostgrest(error);
  const rows = ((data ?? []) as Row[]).map(toRenewal);
  if (!rows.length) return empty;
  const ids = [...new Set(rows.map((r) => r.lead_id))];
  const { data: leads } = await ctx.supabase.from('leads').select('id, number, company_name, anonymized_at').eq('workspace_id', ctx.workspaceId).in('id', ids);
  const byId = new Map(((leads ?? []) as { id: string; number: number; company_name: string; anonymized_at: string | null }[]).map((l) => [l.id, l]));
  const live = rows.filter((r) => byId.has(r.lead_id) && !byId.get(r.lead_id)!.anonymized_at);
  const kinds = new Map<RenewalKind, { monthly: number; count: number }>();
  let monthly = 0;
  for (const r of live) {
    const m = renewalMonthly(r.amount, r.period);
    monthly += m;
    const k = kinds.get(r.kind) ?? { monthly: 0, count: 0 };
    kinds.set(r.kind, { monthly: k.monthly + m, count: k.count + 1 });
  }
  const limit = new Date(`${todayIso()}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 60);
  const until = limit.toISOString().slice(0, 10);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    monthly: round(monthly),
    yearly: round(monthly * 12),
    active: live.length,
    clients: new Set(live.map((r) => r.lead_id)).size,
    by_kind: [...kinds].map(([kind, v]) => ({ kind, monthly: round(v.monthly), count: v.count })).sort((a, b) => b.monthly - a.monthly),
    upcoming: live
      .filter((r) => r.next_due_on <= until)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        lead_id: r.lead_id,
        lead_number: byId.get(r.lead_id)!.number,
        company_name: byId.get(r.lead_id)!.company_name,
        kind: r.kind,
        title: r.title,
        amount: r.amount,
        period: r.period,
        next_due_on: r.next_due_on,
      })),
  };
}

/**
 * Cron diário: as renovações ativas com a data a chegar (dentro dos dias de aviso,
 * ou já passadas) ganham uma tarefa "Renovar: …" (para quem trata do cliente) e um
 * aviso no sino. Cada data avisa uma só vez (reminded_for).
 */
export async function runRenewalReminders(options: { dryRun?: boolean; now?: Date } = {}): Promise<{ due: number; tasks: number; skipped?: string }> {
  const admin = createSupabaseAdminClient();
  const today = todayIso(options.now ?? new Date());
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 120);
  const { data, error } = await admin
    .from('client_renewals')
    .select(`workspace_id, ${SELECT}`)
    .eq('active', true)
    .lte('next_due_on', horizon.toISOString().slice(0, 10))
    .limit(2000);
  if (missingTable(error)) return { due: 0, tasks: 0, skipped: 'sem a tabela' };
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as (Row & { workspace_id: string })[])
    .map((r) => ({ ...toRenewal(r), workspace_id: r.workspace_id }))
    .filter((r) => r.reminded_for !== r.next_due_on)
    .filter((r) => {
      const remindOn = new Date(`${r.next_due_on}T12:00:00Z`);
      remindOn.setUTCDate(remindOn.getUTCDate() - r.remind_days);
      return remindOn.toISOString().slice(0, 10) <= today;
    });
  if (!rows.length) return { due: 0, tasks: 0 };
  // Só nos workspaces com a funcionalidade ligada.
  const workspaceIds = [...new Set(rows.map((r) => r.workspace_id))];
  const { data: workspaces } = await admin.from('workspaces').select('id, settings').in('id', workspaceIds);
  const enabled = new Set(
    ((workspaces ?? []) as { id: string; settings: unknown }[]).filter((w) => WorkspaceSettingsSchema.parse(w.settings ?? {}).features.renewals).map((w) => w.id),
  );
  const todo = rows.filter((r) => enabled.has(r.workspace_id));
  if (options.dryRun) return { due: todo.length, tasks: 0 };
  let tasks = 0;
  for (const r of todo) {
    const { data: lead } = await admin
      .from('leads')
      .select('id, number, company_name, assigned_to, created_by, anonymized_at, archived_at')
      .eq('workspace_id', r.workspace_id)
      .eq('id', r.lead_id)
      .maybeSingle();
    if (!lead || lead.anonymized_at) continue;
    const userId = (lead.assigned_to ?? lead.created_by) as string | null;
    const title = `Renovar: ${r.title} (${lead.company_name as string})`.slice(0, 300);
    // A da vez anterior ainda por fazer (ex.: avença mensal): não cria outra igual, só avisa.
    const { data: openTask } = await admin.from('lead_tasks').select('id').eq('workspace_id', r.workspace_id).eq('lead_id', r.lead_id).eq('title', title).is('done_at', null).limit(1);
    const { error: taskError } = openTask?.length ? { error: null } : await admin.from('lead_tasks').insert({
      workspace_id: r.workspace_id,
      lead_id: r.lead_id,
      title,
      due_on: r.next_due_on < today ? today : r.next_due_on,
      assigned_to: userId,
      created_by: null,
      position: -1,
    });
    if (taskError) {
      console.warn('[renovações] tarefa', taskError.message);
      continue;
    }
    if (!openTask?.length) tasks++;
    await admin.from('client_renewals').update({ reminded_for: r.next_due_on }).eq('id', r.id);
    if (userId) {
      const late = r.next_due_on < today;
      await saveAlert(r.workspace_id, userId, {
        kind: 'client',
        leadId: r.lead_id,
        title: `🔁 ${late ? 'Renovação em atraso' : 'Renovação a chegar'}: ${r.title}`,
        body: `${lead.company_name as string} · ${RENEWAL_KIND_LABELS[r.kind]} · ${renewalPrice(r.amount, r.period)} · ${formatDate(r.next_due_on)}`,
        url: `${leadPath(lead as { id: string; number: number; company_name: string })}#projeto`,
        tag: `renewal-${r.id}-${r.next_due_on}`,
      }).catch(() => undefined);
    }
  }
  return { due: todo.length, tasks };
}
