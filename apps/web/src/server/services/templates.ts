import {
  buildTemplateContext,
  pickTemplateVariant,
  renderTemplate,
  todayIso,
  type ContactTemplate,
  type RenderedTemplate,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { getLead } from './leads';
import { loadServiceCatalog } from './service-catalog';
import { loadServiceCategories } from './service-categories';
import { getSignature, getSettings } from './workspace';
import { listVisibilityChecks } from './ai-visibility';

const TEMPLATE_SELECT = 'id, kind, name, subject, body, subject_b, body_b, sector_id, category, is_default, sort_order, updated_at';
// Antes da migração 20261108002100 (sem versão B) e da 20261023000100 (sem categoria): continua a funcionar.
const NO_AB_SELECT = TEMPLATE_SELECT.replace(' subject_b, body_b,', '');
const LEGACY_SELECT = NO_AB_SELECT.replace(' category,', '');
const missingColumn = (error: { code?: string } | null) => error?.code === '42703';
const withCategory = (t: Omit<ContactTemplate, 'category'> & { category?: string | null }): ContactTemplate => ({
  ...t,
  category: t.category ?? null,
});
const NOT_FOUND = 'Modelo não encontrado';

export async function listTemplates(ctx: ApiContext): Promise<ContactTemplate[]> {
  const query = (select: string) =>
    ctx.supabase.from('contact_templates').select(select).eq('workspace_id', ctx.workspaceId).order('sort_order').order('name');
  let { data, error } = await query(TEMPLATE_SELECT);
  if (missingColumn(error)) ({ data, error } = await query(NO_AB_SELECT));
  if (missingColumn(error)) ({ data, error } = await query(LEGACY_SELECT));
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as unknown as ContactTemplate[]).map(withCategory);
}

export async function getTemplate(ctx: ApiContext, id: string): Promise<ContactTemplate> {
  const query = (select: string) =>
    ctx.supabase.from('contact_templates').select(select).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle();
  let result = await query(TEMPLATE_SELECT);
  if (missingColumn(result.error)) result = await query(NO_AB_SELECT);
  if (missingColumn(result.error)) result = await query(LEGACY_SELECT);
  return withCategory(unwrap(result, NOT_FOUND) as unknown as ContactTemplate);
}

export async function createTemplate(ctx: ApiContext, input: Record<string, unknown>): Promise<ContactTemplate> {
  let sortOrder = input.sort_order as number | undefined;
  if (sortOrder === undefined) {
    const { data } = await ctx.supabase
      .from('contact_templates')
      .select('sort_order')
      .eq('workspace_id', ctx.workspaceId)
      .order('sort_order', { ascending: false })
      .limit(1);
    sortOrder = (data?.[0]?.sort_order ?? 0) + 1;
  }
  return unwrap(
    await ctx.supabase
      .from('contact_templates')
      .insert({ ...input, sort_order: sortOrder, workspace_id: ctx.workspaceId })
      .select(TEMPLATE_SELECT)
      .single(),
  ) as ContactTemplate;
}

export async function updateTemplate(ctx: ApiContext, id: string, patch: Record<string, unknown>): Promise<ContactTemplate> {
  if (Object.keys(patch).length === 0) return getTemplate(ctx, id);
  return unwrap(
    await ctx.supabase
      .from('contact_templates')
      .update(patch)
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .select(TEMPLATE_SELECT)
      .maybeSingle(),
    NOT_FOUND,
  ) as ContactTemplate;
}

export async function deleteTemplate(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('contact_templates')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
}

/** Preenche um modelo (ou um texto livre) com os dados do lead, da assinatura e das definições. */
export async function renderForLead(
  ctx: ApiContext,
  leadId: string,
  input: { template_id?: string; subject?: string; body?: string },
): Promise<RenderedTemplate> {
  const [lead, signature, settings, template, services, categories, checks] = await Promise.all([
    getLead(ctx, leadId),
    getSignature(ctx),
    getSettings(ctx),
    input.template_id ? getTemplate(ctx, input.template_id) : Promise.resolve(null),
    loadServiceCatalog(ctx),
    loadServiceCategories(ctx),
    listVisibilityChecks(ctx, leadId).catch(() => []),
  ]);
  let sectorArguments: string | null = null;
  if (lead.sector_id) {
    const { data } = await ctx.supabase.from('sectors').select('sales_arguments').eq('id', lead.sector_id).maybeSingle();
    sectorArguments = (data?.sales_arguments as string | null) ?? null;
  }
  const context = buildTemplateContext({
    lead,
    signature,
    sectorArguments,
    optOutLine: settings.opt_out_line,
    today: todayIso(),
    services,
    categories,
    reviewUrl: settings.google_review_url,
    aiVisibility: checks.find((c) => c.status === 'done')?.summary ?? null,
  });
  // Modelo com versão B: A ou B conforme o lead (sempre a mesma para o mesmo lead).
  const version = template ? pickTemplateVariant(template, lead) : null;
  const subject = renderTemplate(input.subject ?? version?.subject ?? '', context);
  const body = renderTemplate(input.body ?? version?.body ?? '', context);
  return {
    template_id: template?.id ?? null,
    template_name: version?.name ?? null,
    subject: subject.text,
    body: body.text,
    missing: [...new Set([...subject.missing, ...body.missing])],
    unknown: [...new Set([...subject.unknown, ...body.unknown])],
  };
}
