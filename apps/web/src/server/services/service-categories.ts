import {
  DEFAULT_SERVICE_CATEGORIES,
  serviceKeyFromLabel,
  type ServiceCategoryCreate,
  type ServiceCategoryInfo,
  type ServiceCategoryItem,
  type ServiceCategoryUpdate,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';

const CATEGORY_SELECT = 'id, key, label, icon, design_portfolio, sort_order';

type CategoryRow = Omit<ServiceCategoryItem, 'service_count' | 'package_count'>;

/** Quantos serviços e pacotes (não arquivados ou não) há em cada categoria. */
async function usage(ctx: ApiContext): Promise<{ services: Map<string, number>; packages: Map<string, number> }> {
  const [services, packages] = await Promise.all([
    ctx.supabase.from('services').select('category').eq('workspace_id', ctx.workspaceId),
    ctx.supabase.from('service_packages').select('category').eq('workspace_id', ctx.workspaceId),
  ]);
  if (services.error) throw fromPostgrest(services.error);
  if (packages.error) throw fromPostgrest(packages.error);
  const count = (rows: { category: string }[]) =>
    rows.reduce((map, r) => map.set(r.category, (map.get(r.category) ?? 0) + 1), new Map<string, number>());
  return { services: count(services.data ?? []), packages: count(packages.data ?? []) };
}

export async function listServiceCategories(ctx: ApiContext): Promise<ServiceCategoryItem[]> {
  const [{ data, error }, counts] = await Promise.all([
    ctx.supabase
      .from('service_categories')
      .select(CATEGORY_SELECT)
      .eq('workspace_id', ctx.workspaceId)
      .order('sort_order')
      .order('label'),
    usage(ctx),
  ]);
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as CategoryRow[]).map((c) => ({
    ...c,
    service_count: counts.services.get(c.key) ?? 0,
    package_count: counts.packages.get(c.key) ?? 0,
  }));
}

/** Para o email com IA; sem a tabela (base de dados por atualizar), as de origem. */
export async function loadServiceCategories(ctx: ApiContext): Promise<ServiceCategoryInfo[]> {
  const { data, error } = await ctx.supabase
    .from('service_categories')
    .select('key, label, icon, design_portfolio')
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order');
  if (error || !data?.length) return DEFAULT_SERVICE_CATEGORIES;
  return data as ServiceCategoryInfo[];
}

function conflictOr(error: Parameters<typeof fromPostgrest>[0]) {
  return error.code === '23505'
    ? new ApiError(409, 'Categoria repetida', 'Já existe uma categoria com esse nome.')
    : fromPostgrest(error, 'Categoria não encontrada');
}

async function getCategory(ctx: ApiContext, id: string): Promise<ServiceCategoryItem> {
  const list = await listServiceCategories(ctx);
  const found = list.find((c) => c.id === id);
  if (!found) throw new ApiError(404, 'Categoria não encontrada');
  return found;
}

export async function createServiceCategory(ctx: ApiContext, input: ServiceCategoryCreate): Promise<ServiceCategoryItem> {
  const { data: existing, error: listError } = await ctx.supabase
    .from('service_categories')
    .select('key, sort_order')
    .eq('workspace_id', ctx.workspaceId);
  if (listError) throw fromPostgrest(listError);
  const rows = (existing ?? []) as { key: string; sort_order: number }[];
  const key = serviceKeyFromLabel(input.label, rows.map((r) => r.key));
  const sortOrder = rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
  const { data, error } = await ctx.supabase
    .from('service_categories')
    .insert({ ...input, key, sort_order: sortOrder, workspace_id: ctx.workspaceId })
    .select(CATEGORY_SELECT)
    .single();
  if (error) throw conflictOr(error);
  return { ...(data as CategoryRow), service_count: 0, package_count: 0 };
}

export async function updateServiceCategory(ctx: ApiContext, id: string, input: ServiceCategoryUpdate): Promise<ServiceCategoryItem> {
  if (Object.keys(input).length) {
    const { data, error } = await ctx.supabase
      .from('service_categories')
      .update(input)
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw conflictOr(error);
    if (!data) throw new ApiError(404, 'Categoria não encontrada');
  }
  return getCategory(ctx, id);
}

/** Só vazia: sem serviços nem pacotes (a base de dados confirma). */
export async function deleteServiceCategory(ctx: ApiContext, id: string): Promise<void> {
  const category = await getCategory(ctx, id);
  if (category.service_count || category.package_count) {
    const parts = [
      category.service_count ? `${category.service_count} serviço${category.service_count === 1 ? '' : 's'}` : null,
      category.package_count ? `${category.package_count} pacote${category.package_count === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    throw new ApiError(409, 'Categoria em uso', `Tem ${parts.join(' e ')}. Muda-os de categoria antes de a apagar.`);
  }
  const { error } = await ctx.supabase.from('service_categories').delete().eq('workspace_id', ctx.workspaceId).eq('id', id);
  if (error) throw fromPostgrest(error, 'Categoria não encontrada');
}

export async function reorderServiceCategories(ctx: ApiContext, ids: readonly string[]): Promise<ServiceCategoryItem[]> {
  for (const [i, id] of ids.entries()) {
    const { error } = await ctx.supabase
      .from('service_categories')
      .update({ sort_order: i + 1 })
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id);
    if (error) throw fromPostgrest(error);
  }
  return listServiceCategories(ctx);
}
