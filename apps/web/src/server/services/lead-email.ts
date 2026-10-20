/**
 * Enviar um email a um lead pela conta do utilizador (Definições → Email de envio)
 * e, opcionalmente, a proposta em PDF. Depois de enviar faz o mesmo que
 * "Marcar como enviado": regista "Email enviado" e o lead avança de estado.
 */
import { LEAD_STATUSES, plainTextToHtml, slugify, type Lead, type LeadEmailSend, type LeadEmailSendResult } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { sendWithAccount } from '../mailer';
import { renderProposalPdf } from '../proposals/pdf';
import { getLead } from './leads';
import { loadSmtpAccount, sentLast24h, smtpError } from './mail-account';
import { getProposal, markProposalSent } from './proposals';
import { getSettings, getSignature } from './workspace';

async function assertCanContact(ctx: ApiContext, lead: Lead, to: string) {
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível enviar emails a um lead anonimizado.');
  const { data, error } = await ctx.supabase.rpc('check_do_not_contact', {
    p_workspace_id: ctx.workspaceId,
    p_company_name: lead.company_name,
    p_website: lead.website,
    p_email: to,
  });
  if (error) throw fromPostgrest(error);
  if ((data as unknown[] | null)?.length) {
    throw new ApiError(422, 'Empresa na lista "não contactar"', 'Esta empresa pediu para não ser contactada: o email não foi enviado.');
  }
}

async function deliver(
  ctx: ApiContext,
  lead: Lead,
  input: LeadEmailSend,
  extra: { attachments?: { filename: string; content: Buffer; contentType: string }[]; template?: string } = {},
): Promise<{ sentToday: number; dailyLimit: number }> {
  await assertCanContact(ctx, lead, input.to);
  const { account, dailyLimit, bccSelf } = await loadSmtpAccount(ctx);
  const sent = await sentLast24h(ctx);
  if (sent >= dailyLimit) {
    throw new ApiError(
      429,
      'Limite diário atingido',
      `Já enviaste ${sent} emails nas últimas 24 horas (limite ${dailyLimit}). O limite protege o teu email de ser marcado como spam; muda-o em Definições → Email de envio.`,
    );
  }
  const bcc = (input.bcc_self ?? bccSelf) ? account.fromEmail : undefined;
  try {
    await sendWithAccount(account, {
      to: input.to,
      bcc,
      subject: input.subject,
      text: input.body,
      html: plainTextToHtml(input.body),
      attachments: extra.attachments,
    });
  } catch (error) {
    throw smtpError(error, account);
  }

  const { error } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: lead.id,
    type: 'email_sent',
    body: input.subject,
    payload: {
      via: 'platform',
      to: input.to,
      template: extra.template ?? input.template ?? null,
      text: input.body.slice(0, 5000),
      attachments: extra.attachments?.map((a) => a.filename) ?? [],
    },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);
  return { sentToday: sent + 1, dailyLimit };
}

/** Email a um lead (scripts, email com IA, email de prospeção). */
export async function sendLeadEmail(ctx: ApiContext, leadId: string, input: LeadEmailSend): Promise<LeadEmailSendResult> {
  const lead = await getLead(ctx, leadId);
  const { sentToday, dailyLimit } = await deliver(ctx, lead, input);

  // Como "Marcar como enviado": um lead identificado passa a Contactado (o follow-up é agendado).
  let statusChanged = false;
  let updated = lead;
  if (lead.status === 'identificado') {
    const { error } = await ctx.supabase
      .from('leads')
      .update({ status: 'contactado', channel: lead.channel ?? 'email' })
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', lead.id);
    if (error) throw fromPostgrest(error);
    statusChanged = true;
    updated = await getLead(ctx, lead.id);
  }
  return {
    sent_to: input.to,
    status_changed: statusChanged,
    next_action_on: updated.next_action_on,
    sent_today: sentToday,
    daily_limit: dailyLimit,
  };
}

/** Proposta por email, com o PDF em anexo; fica "Enviada" e o lead avança para "Proposta enviada". */
export async function sendProposalEmail(ctx: ApiContext, proposalId: string, input: LeadEmailSend): Promise<LeadEmailSendResult> {
  const proposal = await getProposal(ctx, proposalId);
  const [lead, signature, settings] = await Promise.all([getLead(ctx, proposal.lead_id), getSignature(ctx), getSettings(ctx)]);
  const pdf = await renderProposalPdf({ proposal, lead, signature, settings: settings.proposal });
  const filename = `Proposta-${proposal.code}-${slugify(lead.company_name) || 'cliente'}.pdf`;
  const { sentToday, dailyLimit } = await deliver(ctx, lead, input, {
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    template: `Proposta ${proposal.code}`,
  });
  const before = lead.status;
  const { lead: updated } = await markProposalSent(ctx, proposal.id);
  return {
    sent_to: input.to,
    status_changed: updated.status !== before && LEAD_STATUSES.includes(updated.status),
    next_action_on: updated.next_action_on,
    sent_today: sentToday,
    daily_limit: dailyLimit,
  };
}
