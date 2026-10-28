/**
 * Sessão de prospeção: a fila de leads a contactar agora e o registo do
 * resultado de cada contacto (um toque = estado, próxima ação e linha do tempo).
 *
 * Ordem da fila: quem abriu um email nas últimas 48 horas, depois os follow-ups
 * em atraso ou para hoje e, por fim, os leads por contactar (mais quentes primeiro).
 * Os follow-ups e por contactar sem forma de contactar neste modo (sem email válido,
 * ou sem telefone nem email) vão para "Falta email" / "Falta contacto". Quem abriu
 * o email fica sempre na lista.
 */
import {
  LOST_REASON_LABELS,
  PROSPECTING_OUTCOME_LABELS,
  countAttempts,
  formatDate,
  planSequenceAdvance,
  sequenceStepText,
  timeAgo,
  todayIso,
  workingDay,
  type Lead,
  type ProspectingItem,
  type ProspectingMode,
  type ProspectingOutcomeInput,
  type ProspectingQueue,
  type ProspectingResult,
  type ProspectingView,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { fetchRecentlyOpened } from './email-tracking';
import { completeFollowUp } from './follow-up';
import { LEAD_SELECT, getLead, updateLead } from './leads';
import { getSettings } from './workspace';

const MAX_ITEMS = 150;

/** Sequência multicanal: em que passo vai cada lead (ausente = o primeiro). */
async function sequenceSteps(ctx: ApiContext, leadIds: string[]): Promise<Map<string, number>> {
  if (!leadIds.length) return new Map();
  const { data, error } = await ctx.supabase
    .from('lead_sequence_state')
    .select('lead_id, step')
    .eq('workspace_id', ctx.workspaceId)
    .in('lead_id', leadIds);
  if (error) throw fromPostgrest(error);
  return new Map(((data ?? []) as { lead_id: string; step: number }[]).map((r) => [r.lead_id, r.step]));
}

async function setSequenceStep(ctx: ApiContext, leadId: string, step: number | null) {
  const q =
    step === null
      ? ctx.supabase.from('lead_sequence_state').delete().eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId)
      : ctx.supabase
          .from('lead_sequence_state')
          .upsert({ workspace_id: ctx.workspaceId, lead_id: leadId, step, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,lead_id' });
  const { error } = await q;
  if (error) throw fromPostgrest(error);
}

const IN_SEQUENCE = new Set(['identificado', 'contactado']);

/** Início de um dia (AAAA-MM-DD) em Lisboa, como instante UTC. */
export function lisbonMidnight(day: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(guess));
  return new Date(guess.getTime() - hour * 3_600_000).toISOString();
}

/** Emails enviados hoje pela plataforma por esta pessoa (modo email da Prospeção). */
async function emailsToday(ctx: ApiContext): Promise<number> {
  const { count, error } = await ctx.supabase
    .from('lead_activities')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId)
    .eq('actor_user_id', ctx.user.id)
    .eq('type', 'email_sent')
    .gte('created_at', lisbonMidnight(todayIso()));
  if (error) throw fromPostgrest(error);
  return count ?? 0;
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

export async function getProspectingQueue(ctx: ApiContext, filter: ProspectingView = 'all', mode?: ProspectingMode): Promise<ProspectingQueue> {
  const today = todayIso();
  // A equipa de prospeção trabalha só os leads de que é responsável.
  const mine = ctx.role === 'prospector';
  const base = (count = false) => {
    const q = ctx.supabase
      .from('leads')
      .select(count ? 'id' : LEAD_SELECT, count ? { count: 'exact', head: true } : undefined)
      .eq('workspace_id', ctx.workspaceId)
      .is('archived_at', null)
      .is('anonymized_at', null);
    return mine ? q.eq('assigned_to', ctx.user.id) : q;
  };
  type Query = ReturnType<typeof base>;
  // Contactável neste modo (o mesmo que prospectingReachable): um email devolvido não conta.
  // Sem modo (clientes antigos da API): a lista não filtra; "Falta …" usa o critério do email.
  const reach = (q: Query, ok: boolean): Query =>
    !mode && ok
      ? q
      : mode !== 'phone'
      ? ok
        ? q.not('email', 'is', null).is('email_bounced_at', null)
        : q.or('email.is.null,email_bounced_at.not.is.null')
      : ok
        ? q.or('phone.not.is.null,and(email.not.is.null,email_bounced_at.is.null)')
        : q.is('phone', null).or('email.is.null,email_bounced_at.not.is.null');
  const followUps = (count = false) => base(count).in('status', ['contactado', 'respondeu']).lte('next_action_on', today);
  const fresh = (count = false) => base(count).eq('status', 'identificado').or(`next_action_on.is.null,next_action_on.lte.${today}`);

  // Quem abriu o email (só os leads que se podem ver: não arquivados, da pessoa na equipa de prospeção).
  const recentlyOpened = await fetchRecentlyOpened(ctx.supabase, ctx.workspaceId, 30);
  let opened: { lead: Lead; reason: string }[] = [];
  if (recentlyOpened.length) {
    const { data, error } = await base().in('id', recentlyOpened.map((o) => o.lead.id));
    if (error) throw fromPostgrest(error);
    const byId = new Map(((data ?? []) as unknown as Lead[]).map((l) => [l.id, l]));
    opened = recentlyOpened
      .filter((o) => byId.has(o.lead.id))
      .map((o) => ({
        lead: byId.get(o.lead.id)!,
        reason: `${o.clicks ? 'Carregou num link do email' : 'Abriu o email'} ${timeAgo(o.last_opened_at)} — “${o.subject}”`,
      }));
  }
  // Quem abriu fica em "Abriram o email" e não conta nos outros separadores.
  const openedIds = opened.map((o) => o.lead.id);
  const notOpened = (q: Query): Query => (openedIds.length ? q.not('id', 'in', `(${openedIds.join(',')})`) : q);
  const count = async (q: Query) => {
    const { count: n, error } = await q;
    if (error) throw fromPostgrest(error);
    return n ?? 0;
  };
  const list = async (q: Query) => {
    const { data, error } = await q.limit(MAX_ITEMS);
    if (error) throw fromPostgrest(error);
    return (data ?? []) as unknown as Lead[];
  };
  const missing = filter === 'missing';
  const want = (k: ProspectingItem['kind']) => filter === 'all' || filter === k || (missing && k !== 'opened');

  const [followUpLeads, freshLeads, nFollowUp, nFresh, nMissingFollowUp, nMissingFresh, done, emails] = await Promise.all([
    want('follow_up')
      ? list(notOpened(reach(followUps(), !missing)).order('next_action_on', { ascending: true }).order('number', { ascending: true }))
      : [],
    want('new')
      ? list(notOpened(reach(fresh(), !missing)).order('score', { ascending: false }).order('number', { ascending: true }))
      : [],
    count(notOpened(reach(followUps(true), true))),
    count(notOpened(reach(fresh(true), true))),
    count(notOpened(reach(followUps(true), false))),
    count(notOpened(reach(fresh(true), false))),
    doneToday(ctx),
    emailsToday(ctx),
  ]);

  const items: ProspectingItem[] = [];
  const seen = new Set<string>();
  const push = (lead: Lead, kind: ProspectingItem['kind'], reason: string) => {
    if (seen.has(lead.id) || items.length >= MAX_ITEMS) return;
    seen.add(lead.id);
    items.push({ lead, kind, reason });
  };

  if (want('opened') && !missing) for (const o of opened) push(o.lead, 'opened', o.reason);
  for (const lead of followUpLeads) {
    const late = lead.next_action_on && lead.next_action_on < today;
    push(lead, 'follow_up', `${lead.next_action_text ?? 'Follow-up'} — ${late ? `em atraso desde ${formatDate(lead.next_action_on)}` : 'para hoje'}`);
  }
  for (const lead of freshLeads) {
    push(lead, 'new', lead.next_action_on ? `${lead.next_action_text ?? 'Primeiro contacto'} — ${formatDate(lead.next_action_on)}` : 'Ainda não foi contactado');
  }
  const counts = {
    opened: opened.length,
    follow_up: nFollowUp,
    new: nFresh,
    missing: nMissingFollowUp + nMissingFresh,
    all: opened.length + nFollowUp + nFresh,
  };

  // Quantas vezes já se carregou em "Não atendeu" e "Contactado" em cada lead.
  const attempts = await outcomesByLead(ctx, items.map((i) => i.lead.id));
  for (const item of items) item.attempts = countAttempts(attempts.get(item.lead.id) ?? []);

  // Sequência multicanal: o passo a fazer agora em cada lead (com o canal e o modelo).
  const seq = (await getSettings(ctx)).prospecting_sequence;
  if (seq.enabled && items.length) {
    const steps = await sequenceSteps(ctx, items.map((i) => i.lead.id));
    for (const item of items) {
      const index = steps.get(item.lead.id) ?? 0;
      const step = seq.steps[index];
      if (!step || !IN_SEQUENCE.has(item.lead.status)) continue;
      item.sequence = { step: index + 1, total: seq.steps.length, day: step.day, channel: step.channel, template_id: step.template_id };
    }
  }
  return { items, counts, done_today: done, emails_today: emails };
}

/** Resultados registados na Prospeção, por lead, do mais antigo para o mais recente. */
async function outcomesByLead(ctx: ApiContext, leadIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < leadIds.length; i += 100) {
    const { data, error } = await ctx.supabase
      .from('lead_activities')
      .select('lead_id, payload->>outcome')
      .eq('workspace_id', ctx.workspaceId)
      .eq('payload->>via', 'prospecting')
      .in('lead_id', leadIds.slice(i, i + 100))
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error) throw fromPostgrest(error);
    for (const r of (data ?? []) as unknown as { lead_id: string; outcome: string | null }[]) {
      if (!r.outcome) continue;
      out.set(r.lead_id, [...(out.get(r.lead_id) ?? []), r.outcome]);
    }
  }
  return out;
}

/** Regista o resultado de um contacto feito na sessão. */
export async function recordProspectingOutcome(ctx: ApiContext, leadId: string, input: ProspectingOutcomeInput): Promise<ProspectingResult> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível registar contactos num lead anonimizado.');
  const tomorrow = 1;
  const settings = await getSettings(ctx);
  const seq = settings.prospecting_sequence;
  const inSequence = seq.enabled && IN_SEQUENCE.has(lead.status);
  let seqDone: string | null = null;

  // Sequência multicanal: "Contactado" faz o passo atual e agenda o seguinte (no dia certo e no canal certo).
  if (inSequence && input.outcome === 'contacted') {
    const current = (await sequenceSteps(ctx, [leadId])).get(leadId) ?? 0;
    const plan = planSequenceAdvance(seq, Math.min(current, seq.steps.length - 1), todayIso());
    await updateLead(ctx, leadId, {
      ...(lead.status === 'identificado' ? { status: 'contactado' as const } : {}),
      // Sem fins de semana (a não ser que se trabalhe ao fim de semana).
      next_action_on: workingDay(plan.on, settings.work_weekends),
      next_action_text: plan.text,
    });
    await setSequenceStep(ctx, leadId, plan.step);
    seqDone = sequenceStepText(seq, Math.min(current, seq.steps.length - 1));
  } else if (seq.enabled && (input.outcome === 'interested' || input.outcome === 'not_interested')) {
    // Respondeu ou desistiu: sai da sequência.
    await setSequenceStep(ctx, leadId, null);
  }

  switch (inSequence && input.outcome === 'contacted' ? null : input.outcome) {
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
        await completeFollowUp(ctx, leadId, { action: 'done', days: settings.follow_up_days, note: null });
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
      await updateLead(ctx, leadId, {
        status: 'sem_interesse',
        lost_reason: input.lost_reason ?? null,
        retry_on: input.retry_on ?? null,
        next_action_on: null,
        next_action_text: null,
      });
      break;
  }

  const outcomeLabel =
    input.outcome === 'not_interested' && input.lost_reason ? `${PROSPECTING_OUTCOME_LABELS[input.outcome]} (${LOST_REASON_LABELS[input.lost_reason]})` : PROSPECTING_OUTCOME_LABELS[input.outcome];
  const label = seqDone ? `${outcomeLabel} — ${seqDone}` : outcomeLabel;
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
