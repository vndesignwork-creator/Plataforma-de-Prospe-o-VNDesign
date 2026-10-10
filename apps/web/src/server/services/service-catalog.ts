import { DEFAULT_SERVICES, serviceKeyFromLabel, type Service, type ServiceCreate, type ServiceInfo, type ServiceUpdate } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';

const SERVICE_SELECT = 'id, key, label, short_label, category, icon, sort_order, archived_at';

type ServiceRow = Omit<Service, 'lead_count'>;

async function leadCounts(ctx: ApiContext): Promise<Map<string, number>> {
  const { data, error } = await ctx.supabase.rpc('service_lead_counts', { p_workspace_id: ctx.workspaceId });
  if (error) throw fromPostgrest(error);
  return new Map(((data ?? []) as { key: string; lead_count: number }[]).map((r) => [r.key, r.lead_count]));
}

/** Serviços do workspace pela ordem definida, com o número de leads de cada um. */
export async function listServices(ctx: ApiContext, includeArchived = false): Promise<Service[]> {
  let q = ctx.supabase
    .from('services')
    .select(SERVICE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order')
    .order('label');
  if (!includeArchived) q = q.is('archived_at', null);
  const [{ data, error }, counts] = await Promise.all([q, leadCounts(ctx)]);
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as ServiceRow[]).map((s) => ({ ...s, lead_count: counts.get(s.key) ?? 0 }));
}

/**
 * Nomes e categorias para a importação, a exportação e o email com IA (inclui os
 * escondidos). Se a base de dados ainda não tiver a tabela, usa os serviços de origem.
 */
export async function loadServiceCatalog(ctx: ApiContext): Promise<ServiceInfo[]> {
  const { data, error } = await ctx.supabase
    .from('services')
    .select('key, label, short_label, category, icon, archived_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order')
    .order('label');
  if (error || !data?.length) return DEFAULT_SERVICES;
  return data as ServiceInfo[];
}

function conflictOr(error: Parameters<typeof fromPostgrest>[0]) {
  return error.code === '23505'
    ? new ApiError(409, 'Serviço repetido', 'Já existe um serviço com esse nome.')
    : fromPostgrest(error, 'Serviço não encontrado');
}

async function getService(ctx: ApiContext, id: string): Promise<Service> {
  const { data, error } = await ctx.supabase
    .from('services')
    .select(SERVICE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw fromPostgrest(error, 'Serviço não encontrado');
  if (!data) throw new ApiError(404, 'Serviço não encontrado');
  const counts = await leadCounts(ctx);
  const row = data as ServiceRow;
  return { ...row, lead_count: counts.get(row.key) ?? 0 };
}

export async function createService(ctx: ApiContext, input: ServiceCreate): Promise<Service> {
  const { data: existing, error: listError } = await ctx.supabase
    .from('services')
    .select('key, sort_order')
    .eq('workspace_id', ctx.workspaceId);
  if (listError) throw fromPostgrest(listError);
  const rows = (existing ?? []) as { key: string; sort_order: number }[];
  const key = serviceKeyFromLabel(input.label, rows.map((r) => r.key));
  const sortOrder = rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
  const { data, error } = await ctx.supabase
    .from('services')
    .insert({ ...input, key, sort_order: sortOrder, workspace_id: ctx.workspaceId })
    .select(SERVICE_SELECT)
    .single();
  if (error) throw conflictOr(error);
  return { ...(data as ServiceRow), lead_count: 0 };
}

export async function updateService(ctx: ApiContext, id: string, input: ServiceUpdate): Promise<Service> {
  const { archived, ...rest } = input;
  const patch: Record<string, unknown> = { ...rest };
  if (archived !== undefined) patch.archived_at = archived ? new Date().toISOString() : null;
  if (Object.keys(patch).length) {
    const { data, error } = await ctx.supabase
      .from('services')
      .update(patch)
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw conflictOr(error);
    if (!data) throw new ApiError(404, 'Serviço não encontrado');
  }
  return getService(ctx, id);
}

/** Só sem leads (senão, esconder); os pacotes e as listas de tarefas ficam sem serviço. */
export async function deleteService(ctx: ApiContext, id: string): Promise<void> {
  const service = await getService(ctx, id);
  if (service.lead_count > 0) {
    throw new ApiError(
      409,
      'Serviço em uso',
      `${service.lead_count === 1 ? 'Há 1 lead' : `Há ${service.lead_count} leads`} com este serviço. Esconde-o em vez de o apagar.`,
    );
  }
  const { error } = await ctx.supabase.from('services').delete().eq('workspace_id', ctx.workspaceId).eq('id', id);
  if (error) throw fromPostgrest(error, 'Serviço não encontrado');
}

/** Nova ordem (os ids pela ordem pretendida). */
export async function reorderServices(ctx: ApiContext, ids: readonly string[]): Promise<Service[]> {
  for (const [i, id] of ids.entries()) {
    const { error } = await ctx.supabase
      .from('services')
      .update({ sort_order: i + 1 })
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id);
    if (error) throw fromPostgrest(error);
  }
  return listServices(ctx, true);
}
