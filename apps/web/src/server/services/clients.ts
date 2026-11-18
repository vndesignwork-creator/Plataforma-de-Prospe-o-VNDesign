/**
 * Separador "Clientes" da página Projetos: cada cliente uma vez só.
 *
 * É a mesma ficha de lead (estado "Cliente"), só agrupada: os projetos novos de um
 * cliente (`client_of`) somam-se ao registo principal. Não há registo de cliente
 * separado, por isso também não há nada para sincronizar.
 */
import { renewalMonthly, summarizePayments, todayIso, type Client, type Lead, type LeadTask, type RenewalPeriod } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { selectInBatches } from '../batch';
import { LEAD_SELECT } from './leads';
import { projectValues } from './project-tools';
import { listTasksForLeads } from './tasks';

/** Tabelas que podem ainda não existir numa base de dados sem as últimas migrações. */
const missingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';

export async function listClients(ctx: ApiContext): Promise<Client[]> {
  const { data, error } = await ctx.supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('status', 'cliente')
    .is('archived_at', null)
    .is('anonymized_at', null)
    .limit(1000);
  if (error) throw fromPostgrest(error);
  const leads = (data ?? []) as unknown as Lead[];
  const mains = leads.filter((l) => !l.client_of);
  if (!mains.length) return [];
  const mainIds = mains.map((l) => l.id);
  // Cada projeto de um cliente (o principal e os ligados) → o id do cliente.
  const clientOf = new Map<string, string>();
  for (const lead of leads) {
    const main = lead.client_of ?? lead.id;
    if (mainIds.includes(main)) clientOf.set(lead.id, main);
  }
  const ids = [...clientOf.keys()];
  const ws = ctx.workspaceId;

  const [tasks, payments, values, renewals, kits] = await Promise.all([
    listTasksForLeads(ctx, ids),
    selectInBatches<{ lead_id: string; amount: number | string; due_on: string | null; paid_on: string | null }>(ids, (batch) =>
      ctx.supabase.from('lead_payments').select('lead_id, amount, due_on, paid_on').eq('workspace_id', ws).in('lead_id', batch),
    ),
    projectValues(ctx, leads.filter((l) => clientOf.has(l.id))),
    ctx.supabase
      .from('client_renewals')
      .select('lead_id, amount, period, next_due_on')
      .eq('workspace_id', ws)
      .eq('active', true)
      .in('lead_id', mainIds)
      .then(({ data: rows, error: err }) => {
        if (err && !missingTable(err)) throw fromPostgrest(err);
        return (rows ?? []) as { lead_id: string; amount: number | string; period: RenewalPeriod; next_due_on: string }[];
      }),
    ctx.supabase
      .from('lead_brand_kits')
      .select('lead_id, colors, fonts, files')
      .eq('workspace_id', ws)
      .in('lead_id', mainIds)
      .then(({ data: rows, error: err }) => {
        if (err && !missingTable(err)) throw fromPostgrest(err);
        return (rows ?? []) as { lead_id: string; colors: unknown[] | null; fonts: unknown[] | null; files: unknown[] | null }[];
      }),
  ]);

  const today = todayIso();
  const projectsOf = (mainId: string) => leads.filter((l) => clientOf.get(l.id) === mainId);

  return mains.map((lead): Client => {
    const own = projectsOf(lead.id);
    const ownIds = own.map((l) => l.id);
    // A próxima tarefa de qualquer projeto deste cliente (a com o prazo mais próximo).
    const open = ownIds.flatMap((id) => (tasks.get(id) ?? []).filter((t) => !t.done_at).map((t) => ({ task: t, lead: own.find((l) => l.id === id)! })));
    const next = [...open].sort((a, b) => (a.task.due_on ?? '9999').localeCompare(b.task.due_on ?? '9999'))[0];
    const pays = payments
      .filter((p) => ownIds.includes(p.lead_id))
      .map((p) => ({ amount: Number(p.amount), due_on: p.due_on, paid_on: p.paid_on }));
    const mine = renewals.filter((r) => r.lead_id === lead.id);
    const kit = kits.find((k) => k.lead_id === lead.id);
    return {
      lead,
      projects: {
        total: own.length,
        active: own.filter((l) => !l.project_completed_at).length,
        completed: own.filter((l) => l.project_completed_at).length,
      },
      payments: summarizePayments(pays, today),
      next_task: next ? ({ ...next.task, lead_id: next.lead.id, company: next.lead.project_title ?? next.lead.company_name } as LeadTask & { lead_id: string; company: string }) : null,
      renewal: mine.length
        ? {
            next_due_on: mine.map((r) => r.next_due_on).sort()[0]!,
            monthly: Math.round(mine.reduce((sum, r) => sum + renewalMonthly(Number(r.amount), r.period), 0) * 100) / 100,
            count: mine.length,
          }
        : null,
      brand_kit: !!kit && ((kit.colors?.length ?? 0) > 0 || (kit.fonts?.length ?? 0) > 0 || (kit.files?.length ?? 0) > 0),
      client_since: lead.status_changed_at ?? lead.created_at ?? null,
      value: own.reduce((sum, l) => sum + (values.get(l.id) ?? 0), 0),
    };
  });
}
