/**
 * Deteção de respostas: lê os emails novos da caixa de entrada do utilizador
 * (Definições → Email de envio) e, quando um vem de um lead contactado, regista
 * "Resposta recebida", passa o lead a "Respondeu" e avisa no telemóvel.
 * Corre pelo cron (de 10 em 10 minutos, no máximo) e pelo botão "Verificar agora".
 */
import {
  isGenericEmailDomain,
  leadPath,
  matchReplyToLead,
  todayIso,
  type InboxMessage,
  type LeadStatus,
  type ReplyCheckResult,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { readInbox } from '../imap';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { loadImapAccount, saveImapState } from './mail-account';
import { sendUserPush } from './push';

/** Na primeira leitura, olha só para os últimos dias. */
const FIRST_READ_DAYS = 14;
/** O cron não lê a mesma caixa mais do que uma vez neste intervalo. */
const CRON_INTERVAL_MS = 10 * 60_000;
/** Estados em que uma resposta interessa (mais à frente no pipeline só se regista). */
const WATCHED: LeadStatus[] = ['contactado', 'respondeu', 'reuniao', 'proposta_enviada'];

type LeadRow = { id: string; number: number; company_name: string; email: string | null; status: LeadStatus; first_contact_on: string | null };

async function watchedLeads(ctx: ApiContext): Promise<LeadRow[]> {
  const { data, error } = await ctx.supabase
    .from('leads')
    .select('id, number, company_name, email, status, first_contact_on')
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
    .eq('type', 'email_received')
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

  let read;
  try {
    read = await readInbox(account, new Date(Date.now() - FIRST_READ_DAYS * 86_400_000));
  } catch (error) {
    const message = error instanceof ApiError ? (error.detail ?? error.title) : 'Erro ao ler a caixa de entrada.';
    await saveImapState(ctx, { imap_error: message });
    throw error;
  }

  const own = account.fromEmail.toLowerCase();
  const incoming = read.messages.filter((m) => m.from !== own);
  const [leads, sent] = incoming.length ? await Promise.all([watchedLeads(ctx), sentMessageIds(ctx)]) : [[], new Map<string, string>()];
  const byId = new Map(leads.map((l) => [l.id, l]));

  const matches: { message: InboxMessage; lead: LeadRow }[] = [];
  for (const message of incoming) {
    const leadId = matchReplyToLead(message, leads, sent, isGenericEmailDomain);
    const lead = leadId ? byId.get(leadId) : undefined;
    if (!lead) continue;
    // Só depois do primeiro contacto (emails antigos da mesma empresa não contam).
    if (lead.first_contact_on && message.date.slice(0, 10) < lead.first_contact_on) continue;
    matches.push({ message, lead });
  }

  const recorded = await alreadyRecorded(ctx, matches.map((m) => messageKey(m.message)));
  const result: ReplyCheckResult = { checked: read.messages.length, replies: [] };
  const changed = new Set<string>();

  for (const { message, lead } of matches) {
    const key = messageKey(message);
    if (recorded.has(key)) continue;
    recorded.add(key);
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
      },
      actor_user_id: ctx.user.id,
    });
    if (error) throw fromPostgrest(error);

    let statusChanged = false;
    if (!message.auto && lead.status === 'contactado' && !changed.has(lead.id)) {
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
    if (!message.auto) {
      await sendUserPush(ctx.workspaceId, ctx.user.id, {
        title: `💬 ${lead.company_name} respondeu`,
        body: message.subject || `Email de ${message.from}`,
        url: leadPath(lead),
        tag: `reply-${lead.id}`,
      }).catch((e) => console.warn('[respostas] notificação falhou', e instanceof Error ? e.message : e));
      result.replies.push({ lead_id: lead.id, company_name: lead.company_name, from: message.from, subject: message.subject, status_changed: statusChanged });
    }
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
