/**
 * Sessão de prospeção: a fila de leads a contactar agora e o registo do
 * resultado de cada contacto (um toque = estado, próxima ação e linha do tempo).
 *
 * Ordem da fila: quem abriu um email nas últimas 48 horas, depois os follow-ups
 * em atraso ou para hoje e, por fim, os leads por contactar (mais quentes primeiro).
 */
import {
  PROSPECTING_OUTCOME_LABELS,
  formatDate,
  timeAgo,
  todayIso,
  type Lead,
  type ProspectingFilter,
  type ProspectingItem,
  type ProspectingOutcomeInput,
  type ProspectingQueue,
  type ProspectingResult,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { fetchRecentlyOpened } from './email-tracking';
import { completeFollowUp } from './follow-up';
import { LEAD_SELECT, getLead, updateLead } from './leads';
import { getSettings } from './workspace';

const MAX_ITEMS = 150;

/** Início do dia de hoje em Lisboa, como instante UTC. */
function lisbonMidnight(day: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(guess));
  return new Date(guess.getTime() - hour * 3_600_000).toISOString();
}

async function doneToday(ctx: ApiContext): Promise<number> {
  const { count, error } = await ctx.supabase
    .from('lead_activities')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId)
    .eq('actor_user_id', ctx.user.id)
    .eq('payload->>via', 'prospecting')
    .gte('created_at', lisbonMidnight(todayIso()));
  if (error) throw fromPostgrest(error);
  return count ?? 0;
}

export async function getProspectingQueue(ctx: ApiContext, filter: ProspectingFilter = 'all'): Promise<ProspectingQueue> {
  const today = todayIso();
  // A equipa de prospeção trabalha só os leads de que é responsável.
  const mine = ctx.role === 'prospector';
  const base = () => {
    const q = ctx.supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('workspace_id', ctx.workspaceId)
      .is('archived_at', null)
      .is('anonymized_at', null);
    return mine ? q.eq('assigned_to', ctx.user.id) : q;
  };
  const want = (k: ProspectingItem['kind']) => filter === 'all' || filter === k;

  const [opened, followUps, fresh, done] = await Promise.all([
    want('opened') ? fetchRecentlyOpened(ctx.supabase, ctx.workspaceId, 30) : Promise.resolve([]),
    want('follow_up')
      ? base()
          .in('status', ['contactado', 'respondeu'])
          .lte('next_action_on', today)
          .order('next_action_on', { ascending: true })
          .order('number', { ascending: true })
          .limit(MAX_ITEMS)
      : null,
    want('new')
      ? base()
          .eq('status', 'identificado')
          .or(`next_action_on.is.null,next_action_on.lte.${today}`)
          .order('score', { ascending: false })
          .order('number', { ascending: true })
          .limit(MAX_ITEMS)
      : null,
    doneToday(ctx),
  ]);
  if (followUps?.error) throw fromPostgrest(followUps.error);
  if (fresh?.error) throw fromPostgrest(fresh.error);

  const items: ProspectingItem[] = [];
  const seen = new Set<string>();
  const push = (lead: Lead, kind: ProspectingItem['kind'], reason: string) => {
    if (seen.has(lead.id) || items.length >= MAX_ITEMS) return;
    seen.add(lead.id);
    items.push({ lead, kind, reason });
  };

  if (opened.length) {
    const { data, error } = await base().in('id', opened.map((o) => o.lead.id));
    if (error) throw fromPostgrest(error);
    const byId = new Map(((data ?? []) as unknown as Lead[]).map((l) => [l.id, l]));
    for (const o of opened) {
      const lead = byId.get(o.lead.id);
      if (lead) push(lead, 'opened', `${o.clicks ? 'Carregou num link do email' : 'Abriu o email'} ${timeAgo(o.last_opened_at)} — “${o.subject}”`);
    }
  }
  for (const lead of (followUps?.data ?? []) as unknown as Lead[]) {
    const late = lead.next_action_on && lead.next_action_on < today;
    push(lead, 'follow_up', `${lead.next_action_text ?? 'Follow-up'} — ${late ? `em atraso desde ${formatDate(lead.next_action_on)}` : 'para hoje'}`);
  }
  for (const lead of (fresh?.data ?? []) as unknown as Lead[]) {
    push(lead, 'new', lead.next_action_on ? `${lead.next_action_text ?? 'Primeiro contacto'} — ${formatDate(lead.next_action_on)}` : 'Ainda não foi contactado');
  }
  return { items, done_today: done };
}

/** Regista o resultado de um contacto feito na sessão. */
export async function recordProspectingOutcome(ctx: ApiContext, leadId: string, input: ProspectingOutcomeInput): Promise<ProspectingResult> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível registar contactos num lead anonimizado.');
  const tomorrow = 1;

  switch (input.outcome) {
    case 'no_answer':
      // Volta a aparecer amanhã.
      await completeFollowUp(ctx, leadId, { action: 'snooze', days: tomorrow, note: null });
      break;
    case 'contacted':
      if (lead.status === 'identificado') {
        // Passar a "Contactado" agenda o follow-up (dias das Definições).
        await updateLead(ctx, leadId, { status: 'contactado' });
      } else {
        // Follow-up feito; o seguinte fica para daqui a uns dias (os das Definições).
        await completeFollowUp(ctx, leadId, { action: 'done', days: (await getSettings(ctx)).follow_up_days, note: null });
      }
      break;
    case 'interested':
      await updateLead(ctx, leadId, {
        status: lead.status === 'reuniao' || lead.status === 'proposta_enviada' ? lead.status : 'respondeu',
        next_action_on: todayIso(),
        next_action_text: 'Marcar reunião ou enviar proposta',
      });
      break;
    case 'later':
      await completeFollowUp(ctx, leadId, { action: 'snooze', days: input.days ?? 3, note: null });
      break;
    case 'not_interested':
      await updateLead(ctx, leadId, { status: 'sem_interesse', next_action_on: null, next_action_text: null });
      break;
  }

  const label = PROSPECTING_OUTCOME_LABELS[input.outcome];
  const { error } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: leadId,
    type: input.outcome === 'no_answer' ? 'call_logged' : 'note',
    body: input.note ? `${label}: ${input.note}` : label,
    payload: { via: 'prospecting', outcome: input.outcome, ...(input.days ? { days: input.days } : {}) },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);
  return { lead: await getLead(ctx, leadId), done_today: await doneToday(ctx) };
}
