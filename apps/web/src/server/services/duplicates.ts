/**
 * Limpeza de duplicados: os grupos de leads com o mesmo email, site ou nome
 * (função lead_duplicate_groups, os mais recentes primeiro), com o principal
 * sugerido; os pares marcados "Não são duplicados" deixam de aparecer.
 * Juntar usa o merge normal.
 */
import { groupDuplicatePairs, pickPrimary, type DuplicateGroup, type DuplicateReason, type Lead } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { LEAD_SELECT } from './leads';

export async function listDuplicateGroups(ctx: ApiContext): Promise<DuplicateGroup[]> {
  const { data, error } = await ctx.supabase.rpc('lead_duplicate_groups', { p_workspace_id: ctx.workspaceId });
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as { reason: DuplicateReason; ids: string[] }[];
  const all = [...new Set(rows.flatMap((r) => r.ids))];
  // Pares marcados "Não são duplicados".
  const ignored = new Set<string>();
  for (let i = 0; i < all.length; i += 150) {
    const { data: ign, error: ignError } = await ctx.supabase
      .from('lead_duplicate_ignores')
      .select('lead_a, lead_b')
      .eq('workspace_id', ctx.workspaceId)
      .in('lead_a', all.slice(i, i + 150));
    if (ignError) throw fromPostgrest(ignError);
    for (const r of (ign ?? []) as { lead_a: string; lead_b: string }[]) ignored.add(`${r.lead_a}|${r.lead_b}`);
  }
  const pairs: { lead_a: string; lead_b: string; reason: DuplicateReason }[] = [];
  for (const r of rows) {
    const ids = [...r.ids].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!ignored.has(`${ids[i]}|${ids[j]}`)) pairs.push({ lead_a: ids[i]!, lead_b: ids[j]!, reason: r.reason });
      }
    }
  }
  const groups = groupDuplicatePairs(pairs);
  const ids = [...new Set(groups.flatMap((g) => g.ids))];
  if (!ids.length) return [];
  const leads = new Map<string, Lead>();
  // Em blocos (o endereço do pedido tem limite de tamanho).
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rows, error: readError } = await ctx.supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('workspace_id', ctx.workspaceId)
      .in('id', ids.slice(i, i + 150));
    if (readError) throw fromPostgrest(readError);
    for (const l of (rows ?? []) as unknown as Lead[]) leads.set(l.id, l);
  }
  return groups
    .map((g) => {
      const list = g.ids.map((id) => leads.get(id)).filter((l): l is Lead => !!l);
      if (list.length < 2) return null;
      const primary = pickPrimary(list);
      return {
        key: g.ids.join(','),
        reasons: g.reasons,
        primary_id: primary.id,
        leads: [primary, ...list.filter((l) => l.id !== primary.id).sort((a, b) => a.number - b.number)],
      };
    })
    .filter((g): g is DuplicateGroup => !!g)
    // Os mais recentes primeiro (os que acabaram de aparecer).
    .sort((a, b) => Math.max(...b.leads.map((l) => l.number)) - Math.max(...a.leads.map((l) => l.number)));
}

/** "Não são duplicados": guarda todos os pares do grupo. */
export async function ignoreDuplicates(ctx: ApiContext, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length < 2) throw new ApiError(422, 'Escolhe pelo menos 2 leads');
  const rows = unique.flatMap((a, i) => unique.slice(i + 1).map((b) => ({ workspace_id: ctx.workspaceId, lead_a: a, lead_b: b })));
  const { error } = await ctx.supabase.from('lead_duplicate_ignores').upsert(rows, { onConflict: 'workspace_id,lead_a,lead_b', ignoreDuplicates: true });
  if (error) throw fromPostgrest(error);
}
