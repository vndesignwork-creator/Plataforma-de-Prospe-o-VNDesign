/**
 * Gerador de emails com IA: junta os dados do lead, a última análise do site,
 * os argumentos do setor e a assinatura, pede um rascunho ao Claude (saída
 * estruturada) e acrescenta a assinatura e a linha de opt-out.
 */
import {
  AI_EMAIL_SYSTEM_PROMPT,
  AiEmailDraftSchema,
  MOBILE_STATUS_META,
  buildAiEmailPrompt,
  finalizeAiEmail,
  formatCurrency,
  formatSignature,
  proposalCode,
  type AiEmailRequest,
  type AiEmailResult,
  type SiteAudit,
} from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getLead } from './leads';
import { listSectors } from './sectors';
import { loadServiceCatalog } from './service-catalog';
import { loadServiceCategories } from './service-categories';
import { getSettings, getSignature } from './workspace';

async function latestAudit(ctx: ApiContext, leadId: string) {
  const { data } = await ctx.supabase
    .from('site_audits')
    .select('issues, cms, status')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Pick<SiteAudit, 'issues' | 'cms'> | null;
}

async function latestProposal(ctx: ApiContext, leadId: string) {
  const { data } = await ctx.supabase
    .from('proposals')
    .select('number, total, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { number: number; total: number; created_at: string } | null;
}

export async function generateAiEmail(ctx: ApiContext, leadId: string, request: AiEmailRequest): Promise<AiEmailResult> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível escrever para um lead anonimizado.');

  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.email, { anthropicModel: aiModel() });
  const [signature, sectors, audit, proposal, services, categories] = await Promise.all([
    getSignature(ctx),
    lead.sector_id ? listSectors(ctx, true) : Promise.resolve([]),
    request.use_audit ? latestAudit(ctx, leadId) : Promise.resolve(null),
    request.kind === 'envio_proposta' ? latestProposal(ctx, leadId) : Promise.resolve(null),
    loadServiceCatalog(ctx),
    loadServiceCategories(ctx),
  ]);
  const sector = sectors.find((s) => s.id === lead.sector_id);

  const prompt = buildAiEmailPrompt(request, {
    lead: {
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      sector: sector?.name ?? null,
      city: lead.city,
      website: lead.website,
      problems: lead.problems,
      pagespeed: lead.pagespeed,
      mobile: lead.mobile === 'desconhecido' ? null : MOBILE_STATUS_META[lead.mobile].label,
      approach_angle: lead.approach_angle,
      notes: lead.notes,
      first_contact_on: lead.first_contact_on,
      previous_subject: request.kind === 'follow_up' ? lead.email_subject : null,
      services: lead.services ?? [],
    },
    sectorArguments: sector?.sales_arguments ?? null,
    services,
    categories,
    auditIssues: audit?.issues ?? [],
    auditCms: audit?.cms ?? null,
    sender: {
      name: signature.full_name,
      company: signature.company,
      website: signature.website,
      portfolio: signature.portfolio_url,
      designPortfolio: signature.design_portfolio_url ?? null,
    },
    proposal: proposal
      ? { code: proposalCode(proposal.number, proposal.created_at), total: formatCurrency(Number(proposal.total)) }
      : null,
  });

  const { data: draft, model: usedModel } = await generateJson(provider, model, {
    system: AI_EMAIL_SYSTEM_PROMPT,
    prompt,
    schema: AiEmailDraftSchema,
    schemaName: 'email',
  });
  if (!draft.body.trim()) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');

  const final = finalizeAiEmail(draft, formatSignature(signature), settings.opt_out_line);

  const { error } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: leadId,
    type: 'ai_email_generated',
    payload: { kind: request.kind, tone: request.tone, model: usedModel },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);

  return { ...final, model: usedModel };
}
