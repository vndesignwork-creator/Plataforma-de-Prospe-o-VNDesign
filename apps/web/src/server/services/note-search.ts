/**
 * Pesquisa rápida nas notas e chamadas registadas (sem acentos nem maiúsculas),
 * as mais recentes primeiro; leads arquivados ou anonimizados ficam de fora.
 */
import type { NoteSearchQuery, NoteSearchResult } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';

export async function searchNotes(ctx: ApiContext, query: NoteSearchQuery): Promise<NoteSearchResult[]> {
  const { data, error } = await ctx.supabase.rpc('search_lead_notes', { p_workspace_id: ctx.workspaceId, p_q: query.q, p_limit: query.limit });
  if (error) throw fromPostgrest(error);
  type Row = {
    id: string;
    type: NoteSearchResult['type'];
    body: string | null;
    created_at: string;
    lead_id: string;
    lead_number: number;
    company_name: string;
    project_title: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    type: r.type,
    body: r.body ?? '',
    created_at: r.created_at,
    lead: { id: r.lead_id, number: r.lead_number, company_name: r.company_name, project_title: r.project_title },
  }));
}
