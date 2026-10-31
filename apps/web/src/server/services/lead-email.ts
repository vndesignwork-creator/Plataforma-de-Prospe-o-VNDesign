/**
 * Enviar um email a um lead pela conta do utilizador (Definições → Email de envio)
 * e, opcionalmente, a proposta em PDF. Depois de enviar faz o mesmo que
 * "Marcar como enviado": regista "Email enviado" e o lead avança de estado.
 */
import {
  LEAD_STATUSES,
  leadServiceCategory,
  planNextFollowUp,
  emailBodyHtml,
  toPlainText,
  rankTemplatesForLead,
  replySubject,
  slugify,
  todayIso,
  workingDay,
  type FollowUpDraft,
  type Lead,
  type LeadEmailSend,
  type LeadEmailSendResult,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { sendWithAccount } from '../mailer';
import { renderProposalPdf } from '../proposals/pdf';
import { latestScreenshots } from './audits';
import { diagnosisPdf } from './diagnosis';
import { prepareTracking } from './email-tracking';
import { withSignatureLogo } from './signature-logo';
import { getLead } from './leads';
import { loadSmtpAccount, sentLast24h, smtpError } from './mail-account';
import { getProposal, markProposalSent } from './proposals';
import { loadServiceCatalog } from './service-catalog';
import { listTemplates, renderForLead } from './templates';
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
  const wantsCopy = input.bcc_self ?? bccSelf;
  // A mensagem pode vir do editor (HTML) ou em texto simples (modelos, IA, API).
  const text = toPlainText(input.body);
  if (!text.trim()) throw new ApiError(422, 'Mensagem em branco', 'Escreve a mensagem.', { errors: { body: ['Escreve a mensagem.'] } });
  // O logótipo da assinatura (se houver) vai embutido por baixo da assinatura.
  const signed = await withSignatureLogo(ctx, emailBodyHtml(input.body));
  const html = signed.html;
  const attachments = signed.attachment ? [...(extra.attachments ?? []), signed.attachment] : extra.attachments;
  // Com o rastreio, a cópia para o próprio vai à parte e sem ele (abri-la não conta como aberto).
  const tracking = await prepareTracking(ctx, lead.id, input.subject, html);
  const trackingId = tracking ? await tracking.save() : null;
  let messageId: string | null = null;
  try {
    const info = await sendWithAccount(account, {
      to: input.to,
      bcc: wantsCopy && !tracking ? account.fromEmail : undefined,
      subject: input.subject,
      text,
      html: tracking?.html ?? html,
      attachments,
      inReplyTo: input.in_reply_to,
    });
    messageId = info.messageId ?? null;
  } catch (error) {
    await tracking?.discard();
    throw smtpError(error, account);
  }
  if (wantsCopy && tracking) {
    await sendWithAccount(account, {
      to: account.fromEmail,
      subject: input.subject,
      text,
      html,
      attachments,
      inReplyTo: input.in_reply_to,
    }).catch(() => undefined);
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
      text: text.slice(0, 5000),
      attachments: extra.attachments?.map((a) => a.filename) ?? [],
      // Para reconhecer a resposta (In-Reply-To) na caixa de entrada.
      message_id: messageId,
      ...(trackingId ? { tracking_id: trackingId } : {}),
    },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);
  return { sentToday: sent + 1, dailyLimit };
}

/** Email a um lead (scripts, email com IA, email de prospeção, follow-ups da sequência). */
export async function sendLeadEmail(ctx: ApiContext, leadId: string, input: LeadEmailSend): Promise<LeadEmailSendResult> {
  const lead = await getLead(ctx, leadId);
  const diagnosis = input.attach_diagnosis ? await diagnosisPdf(ctx, lead.id) : null;
  const shots = input.attach_screenshots ? await latestScreenshots(ctx, lead.id) : [];
  if (input.attach_screenshots && !shots.length) {
    throw new ApiError(422, 'Sem imagens do site', 'Este lead ainda não tem imagens do site: tira-as no cartão “Diagnóstico do site”.');
  }
  const attachments = [
    ...(diagnosis ? [{ filename: diagnosis.filename, content: diagnosis.content, contentType: 'application/pdf' }] : []),
    ...shots.map((sh) => ({ filename: sh.filename, content: sh.buffer, contentType: sh.contentType })),
  ];
  const { sentToday, dailyLimit } = await deliver(ctx, lead, input, attachments.length ? { attachments } : {});

  // Como "Marcar como enviado": um lead identificado passa a Contactado; num lead
  // contactado, conta como follow-up feito. A próxima ação segue a sequência.
  let statusChanged = false;
  let followUpStep: number | null = null;
  let updated = lead;
  if (lead.status === 'identificado' || lead.status === 'contactado') {
    const first = lead.status === 'identificado';
    const sent = first ? 0 : (lead.follow_up_count ?? 0) + 1;
    const settings = await getSettings(ctx);
    const plan = planNextFollowUp(settings, sent, todayIso());
    const { error } = await ctx.supabase.rpc('vnd_after_email_sent', {
      p_lead_id: lead.id,
      p_first: first,
      p_next_on: workingDay(plan.on, settings.work_weekends),
      p_next_text: plan.text,
      p_follow_up_count: sent,
      p_step: first ? null : sent,
    });
    if (error) throw fromPostgrest(error, 'Lead não encontrado');
    statusChanged = first;
    followUpStep = first ? null : sent;
    updated = await getLead(ctx, lead.id);
  }
  return {
    sent_to: input.to,
    status_changed: statusChanged,
    next_action_on: updated.next_action_on,
    next_action_text: updated.next_action_text,
    follow_up_step: followUpStep,
    sent_today: sentToday,
    daily_limit: dailyLimit,
  };
}

/** Último email enviado pela plataforma a este lead (para o follow-up seguir na mesma conversa). */
async function lastPlatformEmail(ctx: ApiContext, leadId: string): Promise<{ subject: string; messageId: string | null } | null> {
  const { data, error } = await ctx.supabase
    .from('lead_activities')
    .select('body, payload')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .eq('type', 'email_sent')
    .eq('payload->>via', 'platform')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) return null;
  const payload = (data.payload ?? {}) as { message_id?: string | null };
  return { subject: (data.body as string | null) ?? '', messageId: payload.message_id ?? null };
}

/**
 * O próximo follow-up da sequência, já escrito: o modelo do passo (ou o mais
 * adequado ao lead) preenchido, como resposta ao último email enviado.
 */
export async function followUpDraft(ctx: ApiContext, leadId: string): Promise<FollowUpDraft> {
  const lead = await getLead(ctx, leadId);
  if (lead.status !== 'contactado') {
    throw new ApiError(
      422,
      'Sem follow-up para enviar',
      lead.status === 'identificado'
        ? 'Este lead ainda não foi contactado: envia primeiro o email de prospeção.'
        : 'A sequência de follow-ups só corre enquanto o lead está "Contactado" (já respondeu ou avançou).',
    );
  }
  const [settings, templates, catalog, last] = await Promise.all([
    getSettings(ctx),
    listTemplates(ctx),
    loadServiceCatalog(ctx),
    lastPlatformEmail(ctx, lead.id),
  ]);
  const steps = settings.follow_up_sequence.steps;
  const sent = lead.follow_up_count ?? 0;
  const step = sent + 1;
  // Depois do último passo, repete o modelo do último.
  const configured = steps[Math.min(sent, steps.length - 1)]?.template_id ?? null;
  const followUps = templates.filter((t) => t.kind === 'follow_up');
  const template =
    followUps.find((t) => t.id === configured) ??
    rankTemplatesForLead(followUps, lead, leadServiceCategory(lead.services, catalog))[0] ??
    null;
  const rendered = await renderForLead(ctx, lead.id, template ? { template_id: template.id } : { subject: '', body: '' });
  const subject = last?.subject ? replySubject(last.subject) : rendered.subject;
  return {
    step,
    total: steps.length,
    to: lead.email,
    subject: subject || rendered.subject,
    body: rendered.body,
    template_id: template?.id ?? null,
    template_name: template?.name ?? null,
    in_reply_to: last?.messageId ?? null,
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
