/**
 * Gerador de emails com IA: junta os dados do lead, a última análise do site,
 * os argumentos do setor e a assinatura, pede um rascunho ao Claude (saída
 * estruturada) e acrescenta a assinatura e a linha de opt-out.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
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
import { aiKeyHint, aiModel, anthropicClient, anthropicErrorMessage, isAiConfigured } from '../ai/claude';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getLead } from './leads';
import { listSectors } from './sectors';
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
  if (!isAiConfigured()) {
    throw new ApiError(503, 'IA não configurada', 'Define ANTHROPIC_API_KEY no servidor para usar o gerador de emails (ver README).');
  }
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível escrever para um lead anonimizado.');

  const [signature, settings, sectors, audit, proposal] = await Promise.all([
    getSignature(ctx),
    getSettings(ctx),
    lead.sector_id ? listSectors(ctx, true) : Promise.resolve([]),
    request.use_audit ? latestAudit(ctx, leadId) : Promise.resolve(null),
    request.kind === 'envio_proposta' ? latestProposal(ctx, leadId) : Promise.resolve(null),
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
    },
    sectorArguments: sector?.sales_arguments ?? null,
    auditIssues: audit?.issues ?? [],
    auditCms: audit?.cms ?? null,
    sender: {
      name: signature.full_name,
      company: signature.company,
      website: signature.website,
      portfolio: signature.portfolio_url,
    },
    proposal: proposal
      ? { code: proposalCode(proposal.number, proposal.created_at), total: formatCurrency(Number(proposal.total)) }
      : null,
  });

  const model = aiModel();
  let response;
  try {
    response = await anthropicClient().beta.messages.parse({
      model,
      max_tokens: 16000,
      // Se o pedido for recusado pelos filtros de segurança, a API tenta outro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: betaZodOutputFormat(AiEmailDraftSchema) },
      // As instruções fixas ficam em cache entre pedidos.
      system: [{ type: 'text', text: AI_EMAIL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('[ia] chave recusada', anthropicErrorMessage(error), aiKeyHint());
      throw new ApiError(
        503,
        'Chave da IA inválida',
        `A Anthropic recusou a chave em uso (${aiKeyHint()}): "${anthropicErrorMessage(error)}". Confirma que é a chave que criaste, que não foi apagada e que só há uma linha ANTHROPIC_API_KEY no .env.local; depois reinicia o servidor.`,
      );
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      console.error('[ia] sem permissão', anthropicErrorMessage(error));
      throw new ApiError(503, 'Chave sem permissão', `A Anthropic recusou o pedido: ${anthropicErrorMessage(error)}`);
    }
    if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(anthropicErrorMessage(error))) {
      throw new ApiError(402, 'Sem créditos na Anthropic', 'A conta não tem créditos. Compra créditos em console.anthropic.com → Billing.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ApiError(429, 'Demasiados pedidos', 'O limite da IA foi atingido. Tenta outra vez dentro de um minuto.');
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      throw new ApiError(504, 'A IA demorou demasiado', 'Tenta outra vez.');
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[ia] erro da API', error.status, anthropicErrorMessage(error));
      throw new ApiError(502, 'Erro da IA', `A Anthropic respondeu ${error.status ?? 'com um erro'}: ${anthropicErrorMessage(error)}`);
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new ApiError(422, 'Pedido recusado pela IA', 'Reformula as indicações e tenta outra vez.');
  }
  const draft = response.parsed_output;
  if (!draft || !draft.body.trim()) {
    throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');
  }

  const final = finalizeAiEmail(draft, formatSignature(signature), settings.opt_out_line);

  const { error } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: leadId,
    type: 'ai_email_generated',
    payload: { kind: request.kind, tone: request.tone, model: response.model },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);

  return { ...final, model: response.model };
}
