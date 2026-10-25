/**
 * Deteção de respostas: lê os emails novos da caixa de entrada do utilizador
 * (Definições → Email de envio) e, quando um vem de um lead contactado, regista
 * "Resposta recebida", passa o lead a "Respondeu" e avisa no telemóvel. Também:
 *  - "não tenho interesse" → Sem interesse (motivo "Respondeu que não");
 *    "removam-me" → também para a lista Não contactar (RGPD);
 *  - resposta automática de ausência com data → o follow-up passa para o regresso;
 *  - aviso de devolução → o email do lead fica marcado como devolvido e a
 *    sequência de follow-ups para.
 * Corre pelo cron (de 10 em 10 minutos, no máximo) e pelo botão "Verificar agora".
 */
import {
  bounceRecipients,
  bouncedMessageId,
  formatDate,
  isGenericEmailDomain,
  leadPath,
  matchReplyToLead,
  outOfOfficeReturn,
  replyIntent,
  todayIso,
  workingDay,
  type InboxMessage,
  type LeadStatus,
  type ReplyCheckResult,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { readInbox } from '../imap';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { addDoNotContact } from './do-not-contact';
import { loadImapAccount, saveImapState } from './mail-account';
import { sendUserPush } from './push';
import { getSettings } from './workspace';

/** Na primeira leitura, olha só para os últimos dias. */
const FIRST_READ_DAYS = 14;
/** O cron não lê a mesma caixa mais do que uma vez neste intervalo. */
const CRON_INTERVAL_MS = 10 * 60_000;
/** Estados em que uma resposta interessa (mais à frente no pipeline só se regista). */
const WATCHED: LeadStatus[] = ['contactado', 'respondeu', 'reuniao', 'proposta_enviada'];

type LeadRow = {
  id: string;
  number: number;
  company_name: string;
  email: string | null;
  website: string | null;
  status: LeadStatus;
  first_contact_on: string | null;
};

async function watchedLeads(ctx: ApiContext): Promise<LeadRow[]> {
  const { data, error } = await ctx.supabase
    .from('leads')
    .select('id, number, company_name, email, website, status, first_contact_on')
    .eq('workspace_id', ctx.workspaceId)
    .is('archived_at', null)
    .is('anonymized_at', null)
    .in('status', WATCHED)
    .limit(5000);
  if (error) throw fromPostgrest(error);
  return (data ?? []) as LeadRow[];
}

/** Message-ID dos emails enviados pela plataforma → lead (para reconhecer o In-Reply-To). */
async function sentMessageIds(ctx: ApiContext): Promise<Map<string, string>> {
  const { data, error } = await ctx.supabase
    .from('lead_activities')
    .select('lead_id, message_id:payload->>message_id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'email_sent')
    .eq('payload->>via', 'platform')
    .not('payload->>message_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 180 * 86_400_000).toISOString())
    .limit(5000);
  if (error) throw fromPostgrest(error);
  return new Map(((data ?? []) as { lead_id: string; message_id: string }[]).map((r) => [r.message_id, r.lead_id]));
}

/** Respostas já registadas (para não as contar duas vezes). */
async function alreadyRecorded(ctx: ApiContext, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await ctx.supabase
    .from('lead_activities')
    .select('message_id:payload->>message_id')
    .eq('workspace_id', ctx.workspaceId)
    .in('type', ['email_received', 'email_bounced'])
    .in('payload->>message_id', ids);
  if (error) throw fromPostgrest(error);
  return new Set(((data ?? []) as { message_id: string }[]).map((r) => r.message_id));
}

const messageKey = (m: InboxMessage) => m.messageId ?? `${m.from}|${m.date}`;

/** Lê a caixa de entrada e regista as respostas dos leads. */
export async function checkReplies(ctx: ApiContext): Promise<ReplyCheckResult> {
  const account = await loadImapAccount(ctx);
  if (!account) {
    throw new ApiError(
      422,
      'Deteção de respostas desligada',
      'Liga a conta de email e a opção “Detetar respostas” em Definições → Email de envio.',
    );
  }

  const own = account.fromEmail.toLowerCase();
  // Os leads antes de ler: o texto só se lê dos avisos de devolução e das respostas de leads.
  const [leads, sent] = await Promise.all([watchedLeads(ctx), sentMessageIds(ctx)]);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const leadOf = (m: InboxMessage) => matchReplyToLead(m, leads, sent, isGenericEmailDomain);

  let read;
  try {
    read = await readInbox(account, new Date(Date.now() - FIRST_READ_DAYS * 86_400_000), (m) => m.from !== own && (!!m.bounce || !!leadOf(m)));
  } catch (error) {
    const message = error instanceof ApiError ? (error.detail ?? error.title) : 'Erro ao ler a caixa de entrada.';
    await saveImapState(ctx, { imap_error: message });
    throw error;
  }

  const incoming = read.messages.filter((m) => m.from !== own);
  const bounces: { message: InboxMessage; lead: LeadRow; recipient: string }[] = [];
  const matches: { message: InboxMessage; lead: LeadRow }[] = [];
  const byEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email!.trim().toLowerCase(), l]));
  for (const message of incoming) {
    if (message.bounce) {
      // A que lead não chegou: o endereço do relatório ou o Message-ID do email original.
      const text = message.text ?? '';
      const recipients = bounceRecipients(text);
      let lead = recipients.map((r) => byEmail.get(r)).find((l) => !!l);
      if (!lead) {
        const original = bouncedMessageId(text);
        const id = original ? (sent.get(original) ?? sent.get(original.replace(/^<|>$/g, ''))) : undefined;
        lead = id ? byId.get(id) : undefined;
      }
      if (lead) bounces.push({ message, lead, recipient: recipients.find((r) => byEmail.get(r) === lead) ?? lead.email ?? '' });
      continue;
    }
    const leadId = leadOf(message);
    const lead = leadId ? byId.get(leadId) : undefined;
    if (!lead) continue;
    // Só depois do primeiro contacto (emails antigos da mesma empresa não contam).
    // O dia em Lisboa: em UTC, uma resposta logo depois da meia-noite ainda é "ontem".
    if (lead.first_contact_on && todayIso(new Date(message.date)) < lead.first_contact_on) continue;
    matches.push({ message, lead });
  }

  const recorded = await alreadyRecorded(ctx, [...matches, ...bounces].map((m) => messageKey(m.message)));
  const result: ReplyCheckResult = { checked: read.messages.length, replies: [], bounces: [], out_of_office: 0 };
  const changed = new Set<string>();
  const settings = await getSettings(ctx);
  const today = todayIso();
  const notify = (payload: Parameters<typeof sendUserPush>[2]) =>
    sendUserPush(ctx.workspaceId, ctx.user.id, payload).catch((e) => console.warn('[respostas] notificação falhou', e instanceof Error ? e.message : e));

  // Devoluções: o email do lead fica marcado e a sequência de follow-ups para.
  for (const { message, lead, recipient } of bounces) {
    const key = messageKey(message);
    if (recorded.has(key)) continue;
    recorded.add(key);
    const { error } = await ctx.supabase.from('lead_activities').insert({
      workspace_id: ctx.workspaceId,
      lead_id: lead.id,
      type: 'email_bounced',
      body: `O email para ${recipient} foi devolvido: o endereço não existe ou não aceita emails.`,
      payload: { via: 'inbox', message_id: key, recipient, subject: message.subject, received_at: message.date },
      actor_user_id: ctx.user.id,
    });
    if (error) throw fromPostgrest(error);
    const patch: Record<string, unknown> = { email_bounced_at: new Date().toISOString() };
    if (lead.status === 'contactado') {
      patch.next_action_on = today;
      patch.next_action_text = 'Email devolvido: procurar outro email ou contactar por telefone';
    }
    const { error: updateError } = await ctx.supabase.from('leads').update(patch).eq('workspace_id', ctx.workspaceId).eq('id', lead.id);
    if (updateError) throw fromPostgrest(updateError);
    await notify({ title: `📭 Email devolvido · ${lead.company_name}`, body: `${recipient} não existe ou não aceita emails.`, url: leadPath(lead), tag: `bounce-${lead.id}` });
    result.bounces.push({ lead_id: lead.id, company_name: lead.company_name, email: recipient });
  }

  for (const { message, lead } of matches) {
    const key = messageKey(message);
    if (recorded.has(key)) continue;
    recorded.add(key);
    const intent = !message.auto && message.text ? replyIntent(message.text) : null;
    const returnOn = message.auto && message.text ? outOfOfficeReturn(message.text, today) : null;
    const { error } = await ctx.supabase.from('lead_activities').insert({
      workspace_id: ctx.workspaceId,
      lead_id: lead.id,
      type: 'email_received',
      body: message.subject || '(sem assunto)',
      payload: {
        via: 'inbox',
        from: message.from,
        from_name: message.fromName,
        subject: message.subject,
        message_id: key,
        received_at: message.date,
        ...(message.auto ? { auto: true } : {}),
        ...(intent ? { intent } : {}),
        ...(returnOn ? { return_on: returnOn } : {}),
      },
      actor_user_id: ctx.user.id,
    });
    if (error) throw fromPostgrest(error);

    // Ausência com data: o follow-up passa para o dia do regresso (dia útil).
    if (returnOn && lead.status === 'contactado' && !changed.has(lead.id)) {
      const on = workingDay(returnOn, settings.work_weekends);
      const { error: updateError } = await ctx.supabase
        .from('leads')
        .update({ next_action_on: on, next_action_text: `Enviar follow-up (estava fora até ${formatDate(returnOn)})` })
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', lead.id);
      if (updateError) throw fromPostgrest(updateError);
      changed.add(lead.id);
      result.out_of_office++;
    }
    if (message.auto) continue;

    let statusChanged = false;
    if (intent && (lead.status === 'contactado' || lead.status === 'respondeu') && !changed.has(lead.id)) {
      // "Não tenho interesse" / "removam-me": Sem interesse (e, no 2.º caso, Não contactar).
      const { error: updateError } = await ctx.supabase
        .from('leads')
        .update({ status: 'sem_interesse', lost_reason: 'respondeu_nao' })
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', lead.id);
      if (updateError) throw fromPostgrest(updateError);
      if (intent === 'unsubscribe') {
        await addDoNotContact(ctx, {
          company_name: lead.company_name,
          website: lead.website,
          email: lead.email,
          reason: 'Pediu para não ser contactado (resposta por email)',
        }).catch((e) => console.warn('[respostas] não contactar falhou', e instanceof Error ? e.message : e));
      }
      statusChanged = true;
      changed.add(lead.id);
    } else if (lead.status === 'contactado' && !changed.has(lead.id)) {
      // A sequência de follow-ups para aqui: a próxima ação passa a ser responder.
      const { error: updateError } = await ctx.supabase
        .from('leads')
        .update({ status: 'respondeu', next_action_on: todayIso(), next_action_text: 'Responder ao cliente' })
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', lead.id);
      if (updateError) throw fromPostgrest(updateError);
      statusChanged = true;
      changed.add(lead.id);
    }
    await notify({
      title:
        intent === 'unsubscribe'
          ? `🚫 ${lead.company_name} pediu para não ser contactado`
          : intent === 'not_interested'
            ? `👎 ${lead.company_name} respondeu que não tem interesse`
            : `💬 ${lead.company_name} respondeu`,
      body: message.subject || `Email de ${message.from}`,
      url: leadPath(lead),
      tag: `reply-${lead.id}`,
    });
    result.replies.push({ lead_id: lead.id, company_name: lead.company_name, from: message.from, subject: message.subject, status_changed: statusChanged, intent });
  }

  await saveImapState(ctx, { imap_uid_validity: read.uidValidity, imap_last_uid: read.lastUid, imap_error: null });
  return result;
}

export interface InboxCronResult {
  workspace_id: string;
  user_id: string;
  status: 'checked' | 'error' | 'dry_run';
  replies?: number;
  error?: string;
}

/** Cron: lê as caixas de entrada com a deteção ligada (cada uma no máximo de 10 em 10 minutos). */
export async function checkAllInboxes(options: { dryRun?: boolean; now?: Date } = {}): Promise<InboxCronResult[]> {
  const admin = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const { data, error } = await admin
    .from('mail_accounts')
    .select('workspace_id, user_id, imap_checked_at')
    .eq('reply_detection', true)
    .not('password_ciphertext', 'is', null)
    .or(`imap_checked_at.is.null,imap_checked_at.lt.${new Date(now.getTime() - CRON_INTERVAL_MS).toISOString()}`)
    .order('imap_checked_at', { ascending: true, nullsFirst: true })
    .limit(10);
  // Antes da migração 20261028000100 não há estas colunas.
  if (error?.code === '42703') return [];
  if (error) throw new Error(error.message);

  const results: InboxCronResult[] = [];
  for (const row of (data ?? []) as { workspace_id: string; user_id: string }[]) {
    if (options.dryRun) {
      results.push({ ...row, status: 'dry_run' });
      continue;
    }
    const ctx = await systemContext(row.workspace_id, row.user_id);
    // A conta de um antigo membro não é lida em nome de outra pessoa.
    if (!ctx || ctx.user.id !== row.user_id) continue;
    try {
      const checked = await checkReplies(ctx);
      results.push({ ...row, status: 'checked', replies: checked.replies.length });
    } catch (e) {
      results.push({ ...row, status: 'error', error: e instanceof ApiError ? (e.detail ?? e.title) : 'Erro inesperado.' });
    }
  }
  return results;
}
