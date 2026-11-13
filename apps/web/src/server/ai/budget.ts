/**
 * Limite de gasto mensal da IA (Definições → Inteligência artificial → Consumo e créditos).
 * Aos 80% e ao chegar ao limite: aviso no sino do dono e dos administradores (um de cada
 * por mês). Depois do limite, as tarefas automáticas com IA (pesquisas automáticas do
 * gerador, regras, …) param; o que se faz à mão pede confirmação antes de continuar.
 */
import { AI_BUDGET_ERROR, AI_BUDGET_WARN, AiBudgetSchema, todayIso, type AiBudget } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';

const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

/** Início do mês (UTC), como no Consumo e créditos. */
export function monthStart(now = new Date()): string {
  const [y, m] = todayIso(now).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toISOString();
}

/** Gasto estimado deste mês, todos os fornecedores juntos (USD). */
export async function spentThisMonth(workspaceId: string): Promise<number> {
  let total = 0;
  const since = monthStart();
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await createSupabaseAdminClient()
      .from('ai_usage')
      .select('cost_usd')
      .eq('workspace_id', workspaceId)
      .gte('at', since)
      .not('cost_usd', 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error) break;
    for (const r of (data ?? []) as { cost_usd: number | string }[]) total += Number(r.cost_usd);
    if ((data?.length ?? 0) < 1000) break;
  }
  return Math.round(total * 10_000) / 10_000;
}

async function loadBudget(workspaceId: string): Promise<{ settings: Record<string, unknown>; budget: AiBudget }> {
  const { data } = await createSupabaseAdminClient().from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return { settings, budget: AiBudgetSchema.parse(settings.ai_budget ?? {}) };
}

// O gasto do mês guardado uns segundos (cada chamada à IA pergunta).
const cache = new Map<string, { at: number; limit: number | null; spent: number }>();
const CACHE_MS = 30_000;

/** Esquece o que estava guardado (ao mudar o limite e depois de cada chamada). */
export function forgetAiBudget(workspaceId: string) {
  cache.delete(workspaceId);
}

/** Antes de cada chamada à IA: passou o limite do mês? */
export async function assertAiBudget(ctx: ApiContext): Promise<void> {
  if (ctx.aiBudgetOk) return;
  const now = Date.now();
  let hit = cache.get(ctx.workspaceId);
  if (!hit || now - hit.at > CACHE_MS) {
    const { budget } = await loadBudget(ctx.workspaceId);
    hit = { at: now, limit: budget.monthly_usd, spent: budget.monthly_usd === null ? 0 : await spentThisMonth(ctx.workspaceId) };
    cache.set(ctx.workspaceId, hit);
  }
  if (hit.limit === null || hit.spent < hit.limit) return;
  if (ctx.authMethod === 'system') {
    throw new ApiError(
      409,
      'Limite de gasto da IA atingido',
      `Este mês já se gastaram cerca de ${usd(hit.spent)} de ${usd(hit.limit)}: as tarefas automáticas com IA ficam paradas até ao próximo mês (ou até aumentares o limite em Definições → Inteligência artificial).`,
      { code: AI_BUDGET_ERROR },
    );
  }
  throw new ApiError(
    409,
    'Chegaste ao limite de gasto da IA deste mês',
    `Este mês já se gastaram cerca de ${usd(hit.spent)} de ${usd(hit.limit)} (estimativa). Continuar mesmo assim?`,
    { code: AI_BUDGET_ERROR, spent_usd: hit.spent, limit_usd: hit.limit },
  );
}

/** Depois de cada chamada com custo: avisa aos 80% e ao chegar ao limite (um de cada por mês). */
export async function checkAiBudgetAlert(workspaceId: string): Promise<void> {
  forgetAiBudget(workspaceId);
  const { settings, budget } = await loadBudget(workspaceId);
  if (budget.monthly_usd === null) return;
  const month = todayIso().slice(0, 7);
  const spent = await spentThisMonth(workspaceId);
  const limit = budget.monthly_usd;
  const reached = spent >= limit;
  const warn = spent >= limit * AI_BUDGET_WARN;
  if (reached ? budget.alerted_100 === month : !warn || budget.alerted_80 === month) return;
  const next: AiBudget = { ...budget, alerted_80: month, ...(reached ? { alerted_100: month } : {}) };
  const admin = createSupabaseAdminClient();
  await admin.from('workspaces').update({ settings: { ...settings, ai_budget: next } }).eq('id', workspaceId);
  const { data: staff } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).in('role', ['owner', 'admin']);
  const { saveAlert } = await import('../services/push');
  const alert = reached
    ? {
        title: '⛔ Chegaste ao limite de gasto da IA deste mês',
        body: `Cerca de ${usd(spent)} de ${usd(limit)}. As tarefas automáticas com IA param até ao próximo mês; o que fizeres à mão pede confirmação. Podes mudar o limite em Definições → Inteligência artificial.`,
      }
    : {
        title: `⚠️ A IA já gastou ${Math.floor((spent / limit) * 100)}% do limite do mês`,
        body: `Cerca de ${usd(spent)} de ${usd(limit)} (estimativa). Vê o consumo em Definições → Inteligência artificial.`,
      };
  for (const m of (staff ?? []) as { user_id: string }[]) {
    await saveAlert(workspaceId, m.user_id, { kind: 'system', ...alert, url: '/definicoes/ia', tag: `ai-budget-${reached ? '100' : '80'}-${month}` }).catch(() => undefined);
  }
}
