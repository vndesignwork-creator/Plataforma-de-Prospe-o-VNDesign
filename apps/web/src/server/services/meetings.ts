/**
 * Reuniões com os leads: marcar (o lead passa a "Reunião" e a próxima ação fica
 * nesse dia), enviar o convite de calendário (.ics) ao cliente, lembrete no
 * telemóvel 1 hora antes (cron) e desmarcar (com aviso ao cliente).
 */
import {
  buildMeetingIcs,
  formatSignature,
  leadPath,
  plainTextToHtml,
  type LeadMeeting,
  type LeadMeetingCreate,
  type LeadMeetingResult,
  type TodayMeeting,
} from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { sendWithAccount } from '../mailer';
import { isPushConfigured, sendPush, type StoredSubscription } from '../push';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead } from './leads';
import { loadSmtpAccount, smtpError } from './mail-account';
import { getSignature } from './workspace';

const SELECT = 'id, lead_id, starts_at, duration_min, location, notes, invite_sent_to, canceled_at, created_at';
const NOT_FOUND = 'Reunião não encontrada';
/** Estados que passam a "Reunião" ao marcar (mais à frente no pipeline, o estado fica). */
const BEFORE_MEETING = ['identificado', 'contactado', 'respondeu'];

const timeFmt = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'long' });
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });
/** "terça-feira, 28 de outubro às 10:00" (hora de Lisboa). */
export function meetingWhen(iso: string): string {
  const d = new Date(iso);
  return `${dateFmt.format(d)} às ${timeFmt.format(d)}`;
}

export async function listMeetings(ctx: ApiContext, leadId: string): Promise<LeadMeeting[]> {
  const { data, error } = await ctx.supabase
    .from('lead_meetings')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('starts_at', { ascending: false })
    .limit(50);
  if (error) throw fromPostgrest(error);
  return (data ?? []) as LeadMeeting[];
}

async function getMeeting(ctx: ApiContext, id: string): Promise<LeadMeeting> {
  const { data, error } = await ctx.supabase.from('lead_meetings').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  if (!data) throw new ApiError(404, NOT_FOUND);
  return data as LeadMeeting;
}

/** O convite (.ics) desta reunião, para o cliente ou para o próprio calendário. */
async function meetingIcs(ctx: ApiContext, meeting: LeadMeeting, method: 'REQUEST' | 'CANCEL', attendee: string | null) {
  const [lead, signature] = await Promise.all([getLead(ctx, meeting.lead_id), getSignature(ctx)]);
  const organizerName = signature.full_name || signature.company || 'VNDesign';
  const organizerEmail = signature.email || ctx.user.email || 'leads@vndesign.pt';
  return buildMeetingIcs({
    uid: `${meeting.id}@vndesign-leads`,
    startsAt: meeting.starts_at,
    durationMin: meeting.duration_min,
    title: `Reunião ${signature.company || 'VNDesign'} · ${lead.company_name}`,
    description: meeting.notes,
    location: meeting.location,
    organizer: { name: organizerName, email: organizerEmail },
    attendee: attendee ? { name: lead.contact_name, email: attendee } : null,
    method,
    sequence: method === 'CANCEL' ? 1 : 0,
  });
}

export async function meetingIcsFile(ctx: ApiContext, id: string): Promise<{ content: string; filename: string }> {
  const meeting = await getMeeting(ctx, id);
  return { content: await meetingIcs(ctx, meeting, 'REQUEST', null), filename: 'reuniao.ics' };
}

export async function createMeeting(ctx: ApiContext, leadId: string, input: LeadMeetingCreate): Promise<LeadMeetingResult> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível marcar reuniões com um lead anonimizado.');
  const inviteTo = input.send_invite ? (input.invite_to ?? lead.email) : null;
  if (input.send_invite && !inviteTo) {
    throw new ApiError(422, 'Falta o email do cliente', 'Este lead não tem email: escreve o endereço para enviar o convite.', {
      errors: { invite_to: ['Indica o email para o convite.'] },
    });
  }

  const { data, error } = await ctx.supabase
    .from('lead_meetings')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: lead.id,
      starts_at: input.starts_at,
      duration_min: input.duration_min,
      location: input.location,
      notes: input.notes,
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  let meeting = data as LeadMeeting;

  // Convite por email (pela conta de envio), com o ficheiro de calendário.
  if (inviteTo) {
    const { account } = await loadSmtpAccount(ctx);
    const signature = await getSignature(ctx);
    const when = meetingWhen(meeting.starts_at);
    const text = [
      lead.contact_name ? `Olá ${lead.contact_name},` : 'Boa tarde,',
      '',
      `Fica marcada a nossa reunião para ${when} (${meeting.duration_min} minutos).`,
      meeting.location ? `Local: ${meeting.location}` : null,
      meeting.notes ? `\n${meeting.notes}` : null,
      '',
      'Em anexo segue o convite para juntar ao seu calendário. Se precisar de mudar, basta responder a este email.',
      '',
      'Até breve,',
      formatSignature(signature) || account.fromName,
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
    try {
      await sendWithAccount(account, {
        to: inviteTo,
        subject: `Reunião marcada: ${when}`,
        text,
        html: plainTextToHtml(text),
        icalEvent: { method: 'REQUEST', content: await meetingIcs(ctx, meeting, 'REQUEST', inviteTo), filename: 'convite.ics' },
      });
    } catch (e) {
      throw smtpError(e, account);
    }
    const { data: updated } = await ctx.supabase
      .from('lead_meetings')
      .update({ invite_sent_to: inviteTo })
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', meeting.id)
      .select(SELECT)
      .single();
    if (updated) meeting = updated as LeadMeeting;
  }

  // O lead passa a "Reunião" e a próxima ação fica nesse dia.
  const day = isoDayFmt.format(new Date(meeting.starts_at));
  const statusChanged = BEFORE_MEETING.includes(lead.status);
  if (statusChanged || lead.status === 'reuniao') {
    const { error: updateError } = await ctx.supabase
      .from('leads')
      .update({
        ...(statusChanged ? { status: 'reuniao' } : {}),
        next_action_on: day,
        next_action_text: `Reunião às ${timeFmt.format(new Date(meeting.starts_at))}`,
      })
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', lead.id);
    if (updateError) throw fromPostgrest(updateError);
  }
  await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: lead.id,
    type: 'meeting_scheduled',
    body: meetingWhen(meeting.starts_at),
    payload: { starts_at: meeting.starts_at, duration_min: meeting.duration_min, location: meeting.location, invite_sent_to: meeting.invite_sent_to },
    actor_user_id: ctx.user.id,
  });
  return { meeting, invite_sent_to: meeting.invite_sent_to, status_changed: statusChanged };
}

/** Desmarcar; se o cliente recebeu convite, recebe também o cancelamento (e sai do calendário dele). */
export async function cancelMeeting(ctx: ApiContext, id: string, notify: boolean): Promise<LeadMeeting> {
  const meeting = await getMeeting(ctx, id);
  if (meeting.canceled_at) return meeting;
  if (notify && meeting.invite_sent_to) {
    const { account } = await loadSmtpAccount(ctx);
    const when = meetingWhen(meeting.starts_at);
    const text = `Boa tarde,\n\nA reunião de ${when} fica desmarcada. Entrarei em contacto para combinarmos outra data.\n\nCumprimentos,\n${account.fromName}`;
    try {
      await sendWithAccount(account, {
        to: meeting.invite_sent_to,
        subject: `Reunião desmarcada: ${when}`,
        text,
        html: plainTextToHtml(text),
        icalEvent: { method: 'CANCEL', content: await meetingIcs(ctx, meeting, 'CANCEL', meeting.invite_sent_to), filename: 'cancelamento.ics' },
      });
    } catch (e) {
      throw smtpError(e, account);
    }
  }
  const { data, error } = await ctx.supabase
    .from('lead_meetings')
    .update({ canceled_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: meeting.lead_id,
    type: 'meeting_canceled',
    body: meetingWhen(meeting.starts_at),
    payload: { starts_at: meeting.starts_at, notified: notify && !!meeting.invite_sent_to },
    actor_user_id: ctx.user.id,
  });
  return data as LeadMeeting;
}

/** Reuniões de hoje e dos próximos 7 dias (lista "Hoje"). */
export async function fetchTodayMeetings(client: SupabaseClient, workspaceId: string): Promise<TodayMeeting[]> {
  const from = new Date(Date.now() - 2 * 3600_000).toISOString();
  const to = new Date(Date.now() + 8 * 86_400_000).toISOString();
  const { data, error } = await client
    .from('lead_meetings')
    .select('id, starts_at, duration_min, location, lead:leads!inner(id, number, company_name, archived_at, anonymized_at)')
    .eq('workspace_id', workspaceId)
    .is('canceled_at', null)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true })
    .limit(50);
  // Antes da migração 20261029000100 não há reuniões.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as unknown as (TodayMeeting & { lead: TodayMeeting['lead'] & { archived_at: string | null } })[])
    .filter((m) => !m.lead.archived_at)
    .map((m) => ({ id: m.id, starts_at: m.starts_at, duration_min: m.duration_min, location: m.location, lead: { id: m.lead.id, number: m.lead.number, company_name: m.lead.company_name } }));
}

/** Cron (de 5 em 5 minutos): notificação 1 hora antes de cada reunião. */
export async function sendMeetingReminders(options: { dryRun?: boolean; now?: Date } = {}) {
  const admin = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const { data, error } = await admin
    .from('lead_meetings')
    .select('id, workspace_id, starts_at, location, lead:leads(number, company_name)')
    .is('canceled_at', null)
    .is('reminder_sent_at', null)
    .gt('starts_at', now.toISOString())
    .lte('starts_at', new Date(now.getTime() + 60 * 60_000).toISOString())
    .limit(100);
  if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
  if (error) throw new Error(error.message);
  const meetings = (data ?? []) as unknown as { id: string; workspace_id: string; starts_at: string; location: string | null; lead: { number: number; company_name: string } }[];
  const results: { meeting_id: string; devices: number }[] = [];
  for (const m of meetings) {
    if (options.dryRun) {
      results.push({ meeting_id: m.id, devices: 0 });
      continue;
    }
    let devices = 0;
    if (isPushConfigured()) {
      const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('workspace_id', m.workspace_id);
      const list = (subs ?? []) as StoredSubscription[];
      devices = list.length;
      await Promise.all(
        list.map((sub) =>
          sendPush(sub, {
            title: `📅 Reunião às ${timeFmt.format(new Date(m.starts_at))}`,
            body: [m.lead.company_name, m.location].filter(Boolean).join(' · '),
            url: leadPath(m.lead),
            tag: `meeting-${m.id}`,
          }),
        ),
      );
    }
    await admin.from('lead_meetings').update({ reminder_sent_at: now.toISOString() }).eq('id', m.id);
    results.push({ meeting_id: m.id, devices });
  }
  return results;
}
