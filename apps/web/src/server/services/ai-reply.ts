/**
 * Responder com IA às respostas dos leads: pega no que o lead escreveu, junta o
 * que já se sabe dele (ficha, análise do site, proposta) e pede ao modelo
 * escolhido em Definições → Inteligência artificial a resposta, já com a
 * assinatura. Nada é enviado: o rascunho é para ler, mudar e enviar à mão.
 */
import {
  REPLY_SYSTEM_PROMPT,
  ReplyDraftOutputSchema,
  aiFunctionSetting,
  buildReplyPrompt,
  finalizeReply,
  formatCurrency,
  formatSignature,
  proposalCode,
  type ReplyDraft,
  type ReplyDraftRequest,
} from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { hasAiProvider, resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getLead } from './leads';
import { listSectors } from './sectors';
import { getSettings, getSignature } from './workspace';

export async function draftReply(ctx: ApiContext, leadId: string, input: ReplyDraftRequest): Promise<ReplyDraft> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível escrever para um lead anonimizado.');
  if (!(await hasAiProvider(ctx))) {
    throw new ApiError(409, 'Sem IA configurada', 'Liga uma IA em Definições → Inteligência artificial para escrever respostas.');
  }

  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, aiFunctionSetting(settings.ai, 'reply'), { anthropicModel: aiModel() });
  const [signature, sectors, audit, proposal] = await Promise.all([
    getSignature(ctx),
    lead.sector_id ? listSectors(ctx, true) : Promise.resolve([]),
    ctx.supabase
      .from('site_audits')
      .select('issues')
      .eq('workspace_id', ctx.workspaceId)
      .eq('lead_id', leadId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from('proposals')
      .select('number, total, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const issues = ((audit.data?.issues ?? []) as { short?: string; message?: string }[]).map((i) => i.short ?? i.message ?? '').filter(Boolean);
  const last = proposal.data as { number: number; total: number | string; created_at: string } | null;

  const prompt = buildReplyPrompt(input, {
    lead: {
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      sector: sectors.find((s) => s.id === lead.sector_id)?.name ?? null,
      city: lead.city,
      website: lead.website,
      problems: lead.problems,
      status: lead.status,
      services: lead.services ?? [],
      first_contact_on: lead.first_contact_on,
    },
    previousSubject: lead.email_subject,
    auditIssues: issues,
    proposal: last ? { code: proposalCode(last.number, last.created_at), total: formatCurrency(Number(last.total)) } : null,
    sender: { name: signature.full_name, company: signature.company },
  });

  const { data, model: usedModel } = await generateJson(provider, model, {
    system: REPLY_SYSTEM_PROMPT,
    prompt,
    schema: ReplyDraftOutputSchema,
    schemaName: 'resposta_email',
  });
  if (!data.body.trim()) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');

  const final = finalizeReply(data, input.subject || lead.email_subject || '', formatSignature(signature));

  const { error } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: leadId,
    type: 'ai_reply_generated',
    body: final.summary || null,
    payload: { goal: input.goal, tone: input.tone, model: usedModel },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);

  return { ...final, model: usedModel };
}
