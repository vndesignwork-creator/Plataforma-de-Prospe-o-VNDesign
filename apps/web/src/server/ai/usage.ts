/**
 * Regista o consumo de cada chamada à IA (tokens e custo estimado) e avisa quando os créditos
 * carregados estão a acabar (uma vez por carregamento). Nunca lança: um registo que falha não
 * estraga a resposta da IA.
 */
import { AiCreditSchema, DEFAULT_AI_CREDIT, estimateAiCost, type AiTokenUsage } from '@vndesign/core';
import { createSupabaseAdminClient } from '../supabase-admin';
import type { ResolvedProvider } from './providers';

export async function recordAiUsage(provider: ResolvedProvider, feature: string, model: string, usage: AiTokenUsage): Promise<void> {
  const owner = provider.owner;
  if (!owner) return;
  try {
    const cost = provider.kind === 'anthropic' ? estimateAiCost(model, usage) : null;
    const { error } = await createSupabaseAdminClient()
      .from('ai_usage')
      .insert({
        workspace_id: owner.workspaceId,
        user_id: owner.userId,
        feature: feature.slice(0, 60) || 'outros',
        provider_kind: provider.kind,
        model: model.slice(0, 120),
        input_tokens: usage.input_tokens + (usage.cache_write_tokens ?? 0) + (usage.cache_read_tokens ?? 0),
        output_tokens: usage.output_tokens,
        searches: usage.searches ?? 0,
        cost_usd: cost,
      });
    if (error && !['42P01', 'PGRST205'].includes(error.code ?? '')) console.warn('[ia] consumo', error.message);
    if (cost) void checkCreditAlert(owner.workspaceId);
  } catch (e) {
    console.warn('[ia] consumo', e instanceof Error ? e.message : e);
  }
}

/** Gasto estimado (USD) desde uma data. */
export async function spentSince(workspaceId: string, since: string | null): Promise<number> {
  let total = 0;
  for (let from = 0; from < 200_000; from += 1000) {
    let q = createSupabaseAdminClient().from('ai_usage').select('cost_usd').eq('workspace_id', workspaceId).not('cost_usd', 'is', null);
    if (since) q = q.gte('at', since);
    const { data, error } = await q.order('id').range(from, from + 999);
    if (error) break;
    for (const r of (data ?? []) as { cost_usd: number | string }[]) total += Number(r.cost_usd);
    if ((data?.length ?? 0) < 1000) break;
  }
  return Math.round(total * 10_000) / 10_000;
}

const lastCheck = new Map<string, number>();
/** Restam menos do que o limite escolhido: aviso no sino do dono e dos administradores (uma vez por carregamento). */
async function checkCreditAlert(workspaceId: string) {
  const now = Date.now();
  if (now - (lastCheck.get(workspaceId) ?? 0) < 60_000) return;
  lastCheck.set(workspaceId, now);
  const admin = createSupabaseAdminClient();
  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  const credit = AiCreditSchema.parse(settings.ai_credit ?? DEFAULT_AI_CREDIT);
  if (credit.amount_usd === null || credit.alert_below_usd === null || credit.alerted_at) return;
  const remaining = credit.amount_usd - (await spentSince(workspaceId, credit.since));
  if (remaining >= credit.alert_below_usd) return;
  await admin
    .from('workspaces')
    .update({ settings: { ...settings, ai_credit: { ...credit, alerted_at: new Date().toISOString() } } })
    .eq('id', workspaceId);
  const { data: staff } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).in('role', ['owner', 'admin']);
  const { saveAlert } = await import('../services/push');
  for (const m of (staff ?? []) as { user_id: string }[]) {
    await saveAlert(workspaceId, m.user_id, {
      kind: 'system',
      title: '🔋 Os créditos da IA estão a acabar',
      body: `Restam cerca de ${Math.max(0, remaining).toFixed(2).replace('.', ',')} $ (estimativa). Carrega mais no fornecedor e atualiza o valor em Definições → Inteligência artificial.`,
      url: '/definicoes/ia',
      tag: `ai-credit-${credit.since ?? 'start'}`,
    }).catch(() => undefined);
  }
}
