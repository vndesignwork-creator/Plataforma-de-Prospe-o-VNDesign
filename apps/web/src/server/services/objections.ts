/**
 * Respostas a objeções ("É caro", "Já tenho site"…): com IA, escrita para este lead e canal
 * (usa a IA dos emails, em Definições → Inteligência artificial); sem IA, a resposta-base.
 */
import {
  OBJECTION_SYSTEM_PROMPT,
  ObjectionReplyDraftSchema,
  baseObjectionReply,
  buildObjectionPrompt,
  type ObjectionReply,
  type ObjectionRequest,
} from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { hasAiProvider, resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { getLead } from './leads';
import { listSectors } from './sectors';
import { getSettings, getSignature } from './workspace';

export async function replyToObjection(ctx: ApiContext, leadId: string, input: ObjectionRequest): Promise<ObjectionReply> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível escrever para um lead anonimizado.');
  const base = baseObjectionReply(input.objection, input.channel, lead);
  const fallback: ObjectionReply = { objection: input.objection, channel: input.channel, reply: base.reply, tip: base.tip, source: 'template', model: null };
  if (!input.ai || !(await hasAiProvider(ctx))) return fallback;

  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.email, { anthropicModel: aiModel() });
  const [signature, sectors, audit] = await Promise.all([
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
  ]);
  const issues = ((audit.data?.issues ?? []) as { short?: string; message?: string }[]).map((i) => i.short ?? i.message ?? '').filter(Boolean);
  const prompt = buildObjectionPrompt(input, {
    lead: {
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      sector: sectors.find((s) => s.id === lead.sector_id)?.name ?? null,
      city: lead.city,
      website: lead.website,
      problems: lead.problems,
      status: lead.status,
      services: lead.services ?? [],
    },
    auditIssues: issues,
    sender: { name: signature.full_name, company: signature.company },
  });
  try {
    const { data, model: used } = await generateJson(provider, model, { system: OBJECTION_SYSTEM_PROMPT, prompt, schema: ObjectionReplyDraftSchema, schemaName: 'resposta' });
    if (!data.reply.trim()) return fallback;
    return { objection: input.objection, channel: input.channel, reply: data.reply.trim(), tip: data.tip.trim() || null, source: 'ai', model: used };
  } catch (error) {
    // A IA falhou (chave, limite…): fica a resposta-base, para não deixar ninguém sem resposta a meio da chamada.
    console.warn('[objeções] IA', error instanceof Error ? error.message : error);
    return fallback;
  }
}
