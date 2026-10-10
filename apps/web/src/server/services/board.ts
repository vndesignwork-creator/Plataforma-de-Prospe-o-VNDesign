import { LEAD_STATUSES, type BoardColumn, type Lead } from '@vndesign/core';
import type { ApiContext } from '../context';
import { listAllLeads, type LeadFilters } from './leads';
import { withTaskProgress } from './tasks';

/** Kanban: todas as colunas (estados) com os leads ordenados pela posição. */
export async function getBoard(ctx: ApiContext, filters: LeadFilters): Promise<BoardColumn[]> {
  const leads = await withTaskProgress(
    ctx.supabase,
    ctx.workspaceId,
    await listAllLeads(ctx, { ...filters, status: undefined }, { sort: 'kanban_position', ascending: true }),
  );
  const byStatus = new Map<string, Lead[]>(LEAD_STATUSES.map((s) => [s, []]));
  for (const lead of leads) byStatus.get(lead.status)?.push(lead);
  return LEAD_STATUSES.map((status) => {
    const list = byStatus.get(status) ?? [];
    return {
      status,
      total: list.length,
      value: list.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0),
      leads: list,
    };
  });
}
