/**
 * Definições → Inteligência artificial → Consumo e créditos: quanto se gastou no mês (por
 * função, pessoa e modelo) e, com o valor carregado, quanto resta (estimativa).
 */
import { AI_CREDIT_KINDS, AI_CREDIT_META, DEFAULT_AI_CREDIT, creditsOf, aiFeatureLabel, todayIso, type AiCredit, type AiCreditKind, type AiCredits, type AiUsageSummary } from '@vndesign/core';
import { listAiProviders } from '../ai/providers';
import { spentSince } from '../ai/usage';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { teamNames } from './team';
import { getSettings } from './workspace';

type Row = { user_id: string | null; feature: string; provider_kind: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number | string | null };

const staffOnly = (ctx: ApiContext) => {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem acesso', 'Só o dono e os administradores veem o consumo da IA.');
};

function monthBounds(month: string): { from: string; to: string; prevFrom: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const iso = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString();
  return { from: iso(y, m), to: iso(y, m + 1), prevFrom: iso(y, m - 1) };
}

async function rowsBetween(ctx: ApiContext, from: string, to: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; page < 200; page++) {
    const { data, error } = await ctx.supabase
      .from('ai_usage')
      .select('user_id, feature, provider_kind, model, input_tokens, output_tokens, cost_usd')
      .eq('workspace_id', ctx.workspaceId)
      .gte('at', from)
      .lt('at', to)
      .order('id')
      .range(page * 1000, page * 1000 + 999);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code ?? '')) return [];
      throw fromPostgrest(error);
    }
    out.push(...((data ?? []) as Row[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export async function aiUsageSummary(ctx: ApiContext, month?: string): Promise<AiUsageSummary> {
  staffOnly(ctx);
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : todayIso().slice(0, 7);
  const { from, to, prevFrom } = monthBounds(m);
  const [rows, prev, settings, names, providers] = await Promise.all([
    rowsBetween(ctx, from, to),
    rowsBetween(ctx, prevFrom, from),
    getSettings(ctx),
    teamNames(ctx),
    listAiProviders(ctx).catch(() => []),
  ]);
  const nameOf = new Map(names.map((n) => [n.user_id, n.name]));
  const group = (keyOf: (r: Row) => string, labelOf: (key: string) => string) => {
    const map = new Map<string, { calls: number; cost: number; tokens: number }>();
    for (const r of rows) {
      const k = keyOf(r);
      const g = map.get(k) ?? { calls: 0, cost: 0, tokens: 0 };
      g.calls += 1;
      g.cost += Number(r.cost_usd ?? 0);
      g.tokens += r.input_tokens + r.output_tokens;
      map.set(k, g);
    }
    return [...map.entries()]
      .map(([key, g]) => ({ key, label: labelOf(key), calls: g.calls, cost_usd: round(g.cost), tokens: g.tokens }))
      .sort((a, b) => b.cost_usd - a.cost_usd || b.calls - a.calls);
  };
  // Um saldo por fornecedor com chave ligada (e os que já foram usados ou têm saldo indicado).
  const credits = creditsOf(settings);
  const used = new Set<string>([...providers.map((p) => p.kind), ...rows.map((r) => r.provider_kind), ...Object.keys(credits)]);
  const kinds = AI_CREDIT_KINDS.filter((k) => used.has(k));
  const creditRows = await Promise.all(
    (kinds.length ? kinds : (['anthropic'] as AiCreditKind[])).map(async (kind) => {
      const c = credits[kind];
      const spent = c && c.amount_usd !== null ? await spentSince(ctx.workspaceId, c.since, kind) : 0;
      return {
        kind,
        label: AI_CREDIT_META[kind].label,
        amount_usd: c?.amount_usd ?? null,
        since: c?.since ?? null,
        spent_since_usd: spent,
        remaining_usd: c && c.amount_usd !== null ? round(c.amount_usd - spent) : null,
        alert_below_usd: c?.alert_below_usd ?? null,
        spent_month_usd: round(rows.filter((r) => r.provider_kind === kind).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)),
        console_url: AI_CREDIT_META[kind].console,
      };
    }),
  );
  return {
    month: m,
    total_usd: round(rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)),
    previous_month_usd: round(prev.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)),
    calls: rows.length,
    unpriced_calls: rows.filter((r) => r.cost_usd === null).length,
    by_feature: group((r) => r.feature, aiFeatureLabel),
    by_user: group((r) => r.user_id ?? 'sistema', (k) => (k === 'sistema' ? 'Automático (cron)' : (nameOf.get(k) ?? 'Antigo membro'))),
    by_model: group((r) => r.model, (k) => k),
    credits: creditRows,
  };
}

/** O valor carregado (e o limite do aviso). reset: começa a contar o gasto a partir de agora. */
export async function updateAiCredit(
  ctx: ApiContext,
  input: { provider?: AiCreditKind; amount_usd: number | null; alert_below_usd?: number | null; reset?: boolean },
): Promise<AiCredit> {
  staffOnly(ctx);
  const admin = createSupabaseAdminClient();
  const { data: ws, error } = await admin.from('workspaces').select('settings').eq('id', ctx.workspaceId).single();
  if (error) throw fromPostgrest(error);
  const settings = (ws.settings ?? {}) as Record<string, unknown>;
  const kind = input.provider ?? 'anthropic';
  const credits = creditsOf(settings as { ai_credit?: AiCredit; ai_credits?: AiCredits });
  const current: AiCredit = credits[kind] ?? { amount_usd: null, since: null, alert_below_usd: null, alerted_at: null };
  const restart = input.reset || current.since === null || input.amount_usd !== current.amount_usd;
  const next: AiCredit = {
    amount_usd: input.amount_usd,
    since: input.amount_usd === null ? null : restart ? new Date().toISOString() : current.since,
    alert_below_usd: input.alert_below_usd !== undefined ? input.alert_below_usd : current.alert_below_usd,
    // Novo carregamento (ou novo limite): pode voltar a avisar.
    alerted_at: null,
  };
  // O valor antigo (um só saldo) passa para o da Anthropic; daqui em diante, um por fornecedor.
  const { error: saveError } = await admin
    .from('workspaces')
    .update({ settings: { ...settings, ai_credit: { ...DEFAULT_AI_CREDIT }, ai_credits: { ...credits, [kind]: next } } })
    .eq('id', ctx.workspaceId);
  if (saveError) throw fromPostgrest(saveError);
  return next;
}
