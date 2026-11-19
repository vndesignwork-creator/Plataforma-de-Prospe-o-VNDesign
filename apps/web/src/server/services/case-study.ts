/**
 * Caso de estudo de um projeto concluído: junta o que já está na ficha (o que
 * estava mal antes, a análise do site, as entregas aprovadas, as horas, o
 * testemunho) e pede à IA o texto para o portefólio e para as propostas.
 * Fica guardado no projeto, para se voltar a ver sem gastar IA outra vez.
 */
import {
  CASE_STUDY_SYSTEM_PROMPT,
  CaseStudyDraftSchema,
  MOBILE_STATUS_META,
  aiFunctionSetting,
  buildCaseStudyPrompt,
  formatCurrency,
  type CaseStudy,
  type CaseStudyRequest,
} from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { hasAiProvider, resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getLead } from './leads';
import { listSectors } from './sectors';
import { getSettings } from './workspace';
import { loadServiceCatalog } from './service-catalog';
import { getTestimonial } from './testimonials';

/** O caso de estudo guardado (null quando ainda não há). */
export async function getCaseStudy(ctx: ApiContext, leadId: string): Promise<CaseStudy | null> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase.from('lead_projects').select('case_study').eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId).maybeSingle();
  if (error) {
    // Base de dados por atualizar: sem caso de estudo (em vez de erro).
    if (['42703', 'PGRST204'].includes(error.code ?? '')) return null;
    throw fromPostgrest(error);
  }
  return ((data?.case_study as CaseStudy | null) ?? null) || null;
}

export async function deleteCaseStudy(ctx: ApiContext, leadId: string): Promise<void> {
  await getLead(ctx, leadId);
  const { error } = await ctx.supabase.from('lead_projects').update({ case_study: null }).eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId);
  if (error) throw fromPostgrest(error);
}

export async function writeCaseStudy(ctx: ApiContext, leadId: string, input: CaseStudyRequest): Promise<CaseStudy> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível escrever um caso de estudo de um lead anonimizado.');
  if (!lead.project_completed_at) {
    throw new ApiError(409, 'Projeto por concluir', 'O caso de estudo escreve-se a partir de um projeto já entregue.');
  }
  if (!(await hasAiProvider(ctx))) {
    throw new ApiError(409, 'Sem IA configurada', 'Liga uma IA em Definições → Inteligência artificial para escrever o caso de estudo.');
  }

  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, aiFunctionSetting(settings.ai, 'case_study'), { anthropicModel: aiModel() });
  const [sectors, catalog, testimonial, audits, deliverables, revisions, time, payments] = await Promise.all([
    lead.sector_id ? listSectors(ctx, true) : Promise.resolve([]),
    loadServiceCatalog(ctx),
    getTestimonial(ctx, leadId).catch(() => null),
    ctx.supabase
      .from('site_audits')
      .select('issues, pagespeed_mobile, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('lead_id', leadId)
      .eq('status', 'done')
      .order('created_at', { ascending: true })
      .limit(10),
    ctx.supabase.from('project_deliverables').select('title, status').eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId),
    ctx.supabase.from('project_revisions').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId),
    ctx.supabase.from('project_time_entries').select('started_at, ended_at').eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId),
    ctx.supabase.from('lead_payments').select('amount').eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId),
  ]);

  const auditRows = (audits.data ?? []) as { issues: { short?: string; message?: string }[] | null; pagespeed_mobile: number | null; created_at: string }[];
  const first = auditRows[0];
  const last = auditRows.length > 1 ? auditRows[auditRows.length - 1] : null;
  const seconds = ((time.data ?? []) as { started_at: string; ended_at: string | null }[])
    .filter((e) => e.ended_at)
    .reduce((sum, e) => sum + Math.max(0, (Date.parse(e.ended_at!) - Date.parse(e.started_at)) / 1000), 0);
  const paid = ((payments.data ?? []) as { amount: number | string }[]).reduce((sum, p) => sum + Number(p.amount), 0);
  const value = paid || lead.estimated_value || null;

  const prompt = buildCaseStudyPrompt(input, {
    company: lead.company_name,
    sector: sectors.find((s) => s.id === lead.sector_id)?.name ?? null,
    city: lead.city,
    services: (lead.services ?? []).map((key) => catalog.find((s) => s.key === key)?.label ?? key),
    problems: lead.problems,
    auditIssues: (first?.issues ?? []).map((i) => i.short ?? i.message ?? '').filter(Boolean),
    pagespeedBefore: first?.pagespeed_mobile ?? null,
    pagespeedAfter: last?.pagespeed_mobile ?? null,
    mobileBefore: lead.mobile && lead.mobile !== 'desconhecido' ? MOBILE_STATUS_META[lead.mobile].label : null,
    deliverables: ((deliverables.data ?? []) as { title: string; status: string }[]).filter((d) => d.status === 'aprovada').map((d) => d.title),
    revisions: (revisions as { count: number | null }).count ?? null,
    hours: seconds ? Math.round(seconds / 360) / 10 : null,
    value: value ? formatCurrency(Number(value)) : null,
    startedOn: lead.status_changed_at?.slice(0, 10) ?? null,
    completedOn: lead.project_completed_at.slice(0, 10),
    testimonial: testimonial?.quote ? { quote: testimonial.quote, author: testimonial.author_name, rating: testimonial.rating } : null,
  });

  const { data, model: usedModel } = await generateJson(provider, model, {
    system: CASE_STUDY_SYSTEM_PROMPT,
    prompt,
    schema: CaseStudyDraftSchema,
    schemaName: 'caso_estudo',
  });
  if (!data.title.trim() || !data.challenge.trim()) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');

  // O testemunho só entra se o cliente autorizou mostrá-lo.
  const canQuote = !!testimonial?.quote && testimonial.can_publish && !input.anonymous;
  const study: CaseStudy = {
    title: data.title.trim().slice(0, 200),
    summary: data.summary.trim(),
    challenge: data.challenge.trim(),
    work: data.work.map((w) => w.trim()).filter(Boolean).slice(0, 8),
    result: data.result.trim(),
    quote: canQuote ? testimonial!.quote : null,
    quote_author: canQuote ? (testimonial!.author_name ?? null) : null,
    anonymous: input.anonymous,
    model: usedModel,
    created_at: new Date().toISOString(),
  };

  const { error } = await ctx.supabase
    .from('lead_projects')
    .upsert({ lead_id: leadId, workspace_id: ctx.workspaceId, case_study: study }, { onConflict: 'lead_id' });
  // Sem a coluna (base de dados por atualizar) devolve-se o texto na mesma.
  if (error && !['42703', 'PGRST204'].includes(error.code ?? '')) throw fromPostgrest(error);
  return study;
}
