/**
 * Lista "Respostas" (Dashboard): os emails dos leads detetados na caixa de
 * entrada nos últimos N dias e se ainda falta responder. Uma resposta fica
 * tratada quando, depois dela, há um email enviado, uma chamada registada ou
 * "Já tratei" no lead (ex.: respondeu-se pelo Gmail).
 */
import { replyKind, needsAnswer, type Lead, type ReplyItem, type Replies } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { LEAD_SELECT, getLead } from './leads';

const LIMIT = 200;
/** O que conta como "respondido" quando acontece depois da resposta. */
const ANSWER_TYPES = ['email_sent', 'call_logged', 'email_mailto', 'email_copied'];

type ReceivedRow = {
  id: string;
  lead_id: string;
  created_at: string;
  body: string | null;
  payload: { from?: string; from_name?: string | null; subject?: string; message_id?: string; auto?: boolean; intent?: string; return_on?: string } | null;
};

export async function getReplies(ctx: ApiContext, days: number): Promise<Replies> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await ctx.supabase
    .from('lead_activities')
    .select('id, lead_id, created_at, body, payload')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'email_received')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as ReceivedRow[];
  const leadIds = [...new Set(rows.map((r) => r.lead_id))];
  if (!leadIds.length) return { days, items: [], pending: 0 };

  // A equipa de prospeção vê só os leads de que é responsável.
  let leadsQuery = ctx.supabase
    .from('leads')
    .select(`${LEAD_SELECT}, replies_handled_at`)
    .eq('workspace_id', ctx.workspaceId)
    .is('anonymized_at', null)
    .in('id', leadIds);
  if (ctx.role === 'prospector') leadsQuery = leadsQuery.eq('assigned_to', ctx.user.id);
  const [leadsRes, answersRes] = await Promise.all([
    leadsQuery,
    ctx.supabase
      .from('lead_activities')
      .select('lead_id, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .in('type', ANSWER_TYPES)
      .in('lead_id', leadIds)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);
  if (leadsRes.error) throw fromPostgrest(leadsRes.error);
  if (answersRes.error) throw fromPostgrest(answersRes.error);
  const leads = new Map(((leadsRes.data ?? []) as unknown as (Lead & { replies_handled_at: string | null })[]).map((l) => [l.id, l]));
  // A última resposta nossa em cada lead (email enviado ou chamada).
  const lastAnswer = new Map<string, string>();
  for (const a of (answersRes.data ?? []) as { lead_id: string; created_at: string }[]) {
    if (!lastAnswer.has(a.lead_id)) lastAnswer.set(a.lead_id, a.created_at);
  }

  const items: ReplyItem[] = [];
  for (const r of rows) {
    const found = leads.get(r.lead_id);
    if (!found) continue;
    const { replies_handled_at: handledAt, ...lead } = found;
    const p = r.payload ?? {};
    const answeredAt = lastAnswer.get(r.lead_id);
    items.push({
      id: r.id,
      lead,
      from: p.from ?? null,
      from_name: p.from_name ?? null,
      subject: p.subject || r.body || '(sem assunto)',
      received_at: r.created_at,
      message_id: p.message_id ?? null,
      kind: replyKind(p),
      return_on: p.return_on ?? null,
      handled: (!!answeredAt && answeredAt > r.created_at) || (!!handledAt && handledAt >= r.created_at),
    });
  }
  return { days, items, pending: items.filter(needsAnswer).length };
}

/** "Já tratei": as respostas que já chegaram a este lead deixam de estar por responder. */
export async function markRepliesHandled(ctx: ApiContext, leadId: string): Promise<{ handled_at: string }> {
  await getLead(ctx, leadId); // 404 se não existe ou não é visível
  const handledAt = new Date().toISOString();
  const { error } = await ctx.supabase.from('leads').update({ replies_handled_at: handledAt }).eq('workspace_id', ctx.workspaceId).eq('id', leadId);
  if (error) throw fromPostgrest(error);
  return { handled_at: handledAt };
}
