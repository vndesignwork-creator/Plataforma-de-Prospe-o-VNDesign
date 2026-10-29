/**
 * Clientes antigos para voltar a contactar: o último projeto foi concluído há
 * mais de N meses, não há nenhum projeto em curso, ninguém lhes falou por aqui
 * nesse tempo (email "Voltar a contactar" ou "Já falei") e não têm já a tarefa
 * "Propor um novo serviço" por fazer (a que se cria ao concluir um projeto).
 */
import { RECONNECT_TEMPLATE, UPSELL_TASK_PREFIX, addMonths, todayIso, type ReconnectClient, type ReconnectQuery } from '@vndesign/core';
import type { ApiContext } from '../context';
import { selectInBatches } from '../batch';
import { fromPostgrest } from '../http';
import { lisbonMidnight } from './prospecting';

type Row = {
  id: string;
  number: number;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  client_of: string | null;
  project_title: string | null;
  services: string[] | null;
  project_completed_at: string | null;
};

export async function listReconnectClients(ctx: ApiContext, query: ReconnectQuery): Promise<ReconnectClient[]> {
  const today = todayIso();
  const cutoffDay = addMonths(today, -query.months);
  const cutoff = lisbonMidnight(cutoffDay);
  const { data, error } = await ctx.supabase
    .from('leads')
    .select('id, number, company_name, contact_name, email, phone, client_of, project_title, services, project_completed_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('status', 'cliente')
    .is('archived_at', null)
    .is('anonymized_at', null)
    .limit(5000);
  if (error) throw fromPostgrest(error);

  const groups = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) {
    const main = r.client_of ?? r.id;
    groups.set(main, [...(groups.get(main) ?? []), r]);
  }
  const candidates: { main: Row; last: Row; projects: number; ids: string[] }[] = [];
  for (const [mainId, rows] of groups) {
    // Com um projeto em curso, não é "cliente antigo".
    if (rows.some((r) => !r.project_completed_at)) continue;
    const last = rows.reduce((a, b) => (a.project_completed_at! > b.project_completed_at! ? a : b));
    if (last.project_completed_at! >= cutoff) continue;
    candidates.push({ main: rows.find((r) => r.id === mainId) ?? rows[0]!, last, projects: rows.length, ids: rows.map((r) => r.id) });
  }
  if (!candidates.length) return [];

  const ids = candidates.flatMap((c) => c.ids);
  const [tasks, contacted] = await Promise.all([
    selectInBatches<{ lead_id: string }>(ids, (batch) =>
      ctx.supabase
        .from('lead_tasks')
        .select('lead_id')
        .eq('workspace_id', ctx.workspaceId)
        .in('lead_id', batch)
        .is('done_at', null)
        .ilike('title', `${UPSELL_TASK_PREFIX}%`),
    ),
    selectInBatches<{ lead_id: string; type: string; payload: Record<string, unknown> | null }>(ids, (batch) =>
      ctx.supabase
        .from('lead_activities')
        .select('lead_id, type, payload')
        .eq('workspace_id', ctx.workspaceId)
        .in('lead_id', batch)
        .gte('created_at', cutoff)
        .in('type', ['email_sent', 'email_copied', 'note']),
    ),
  ]);
  const skip = new Set(tasks.map((t) => t.lead_id));
  for (const a of contacted) {
    const p = a.payload ?? {};
    if (p.template === RECONNECT_TEMPLATE || p.via === 'reconnect') skip.add(a.lead_id);
  }

  return candidates
    .filter((c) => !c.ids.some((id) => skip.has(id)))
    .sort((a, b) => a.last.project_completed_at!.localeCompare(b.last.project_completed_at!))
    .slice(0, 50)
    .map((c) => ({
      lead: {
        id: c.main.id,
        number: c.main.number,
        company_name: c.main.company_name,
        contact_name: c.main.contact_name,
        email: c.main.email,
        phone: c.main.phone,
      },
      last_completed_at: c.last.project_completed_at!,
      last_project: c.last.project_title ?? null,
      projects: c.projects,
    }));
}
