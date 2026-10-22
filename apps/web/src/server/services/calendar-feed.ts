/**
 * Calendário subscrito: um link secreto por utilizador (.ics) com as reuniões,
 * as entregas dos projetos, os pagamentos previstos e as tarefas com prazo.
 * O Google Calendar / iPhone vão buscá-lo de tempos a tempos (sem sessão).
 */
import { randomBytes } from 'node:crypto';
import { WorkspaceSettingsSchema, addDays, buildCalendarFeed, formatCurrency, leadPath, todayIso, type CalendarFeed, type FeedEvent } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';

export async function getCalendarFeed(ctx: ApiContext): Promise<CalendarFeed> {
  const { data, error } = await ctx.supabase.from('calendar_feeds').select('token').eq('user_id', ctx.user.id).maybeSingle();
  if (error) throw fromPostgrest(error);
  return { token: (data?.token as string | undefined) ?? null };
}

export async function setCalendarFeed(ctx: ApiContext, input: { enabled: boolean; regenerate: boolean }): Promise<CalendarFeed> {
  const current = await getCalendarFeed(ctx);
  if (!input.enabled) {
    const { error } = await ctx.supabase.from('calendar_feeds').delete().eq('user_id', ctx.user.id);
    if (error) throw fromPostgrest(error);
    return { token: null };
  }
  if (current.token && !input.regenerate) return current;
  const token = randomBytes(18).toString('base64url');
  const { error } = await ctx.supabase
    .from('calendar_feeds')
    .upsert({ user_id: ctx.user.id, workspace_id: ctx.workspaceId, token, created_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw fromPostgrest(error);
  return { token };
}

type LeadRef = { id: string; number: number; company_name: string; archived_at: string | null; anonymized_at: string | null };
const LEAD = 'lead:leads!inner(id, number, company_name, archived_at, anonymized_at, status, project_completed_at)';

/** O .ics do link (null se o código não existir). Do último mês até 6 meses à frente. */
export async function calendarFeedIcs(token: string, appUrl: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: feed } = await admin.from('calendar_feeds').select('workspace_id').eq('token', token).maybeSingle();
  if (!feed) return null;
  const ws = feed.workspace_id as string;
  const { data: workspace } = await admin.from('workspaces').select('name, settings').eq('id', ws).maybeSingle();
  const features = WorkspaceSettingsSchema.parse(workspace?.settings ?? {}).features;
  const today = todayIso();
  const from = addDays(today, -30);
  const to = addDays(today, 183);

  const [meetings, dues, payments, tasks] = await Promise.all([
    features.meetings
      ? admin
          .from('lead_meetings')
          .select(`id, starts_at, duration_min, location, notes, ${LEAD}`)
          .eq('workspace_id', ws)
          .is('canceled_at', null)
          .gte('starts_at', `${from}T00:00:00Z`)
          .lte('starts_at', `${to}T23:59:59Z`)
      : Promise.resolve({ data: [] }),
    features.projects
      ? admin
          .from('lead_projects')
          .select(`lead_id, due_on, ${LEAD}`)
          .eq('workspace_id', ws)
          .gte('due_on', from)
          .lte('due_on', to)
          .eq('lead.status', 'cliente')
          .is('lead.project_completed_at', null)
      : Promise.resolve({ data: [] }),
    features.payments
      ? admin
          .from('lead_payments')
          .select(`id, description, amount, due_on, ${LEAD}`)
          .eq('workspace_id', ws)
          .is('paid_on', null)
          .gte('due_on', from)
          .lte('due_on', to)
      : Promise.resolve({ data: [] }),
    admin
      .from('lead_tasks')
      .select(`id, title, due_on, ${LEAD}`)
      .eq('workspace_id', ws)
      .is('done_at', null)
      .gte('due_on', from)
      .lte('due_on', to),
  ]);
  const live = (l: LeadRef) => !l.archived_at && !l.anonymized_at;
  const link = (l: LeadRef) => `${appUrl}${leadPath(l)}`;
  const events: FeedEvent[] = [];
  for (const m of (meetings.data ?? []) as unknown as { id: string; starts_at: string; duration_min: number; location: string | null; notes: string | null; lead: LeadRef }[]) {
    if (!live(m.lead)) continue;
    events.push({ uid: `meeting-${m.id}@vndesign-leads`, title: `Reunião · ${m.lead.company_name}`, startsAt: m.starts_at, durationMin: m.duration_min, location: m.location, description: m.notes, url: link(m.lead) });
  }
  for (const d of (dues.data ?? []) as unknown as { lead_id: string; due_on: string; lead: LeadRef }[]) {
    if (!live(d.lead)) continue;
    events.push({ uid: `due-${d.lead_id}@vndesign-leads`, title: `📦 Entrega · ${d.lead.company_name}`, date: d.due_on, url: link(d.lead) });
  }
  for (const p of (payments.data ?? []) as unknown as { id: string; description: string; amount: number | string; due_on: string; lead: LeadRef }[]) {
    if (!live(p.lead)) continue;
    events.push({
      uid: `payment-${p.id}@vndesign-leads`,
      title: `💶 ${p.description} · ${formatCurrency(Number(p.amount), { decimals: false })} · ${p.lead.company_name}`,
      date: p.due_on,
      url: link(p.lead),
    });
  }
  for (const t of (tasks.data ?? []) as unknown as { id: string; title: string; due_on: string; lead: LeadRef }[]) {
    if (!live(t.lead)) continue;
    events.push({ uid: `task-${t.id}@vndesign-leads`, title: `☐ ${t.title} · ${t.lead.company_name}`, date: t.due_on, url: link(t.lead) });
  }
  return buildCalendarFeed(events, { name: `VNDesign Leads${workspace?.name ? ` · ${workspace.name}` : ''}` });
}
