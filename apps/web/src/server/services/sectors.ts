import { slugify, type Sector } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';

const SECTOR_SELECT =
  'id, name, slug, emoji, icon, sort_order, priority_rank, opportunity_notes, sales_arguments, archived_at';

type SectorRow = Omit<Sector, 'lead_count'> & { leads?: { count: number }[] };

function toSector(row: SectorRow): Sector {
  const { leads, ...rest } = row;
  return { ...rest, lead_count: leads?.[0]?.count ?? 0 };
}

export async function listSectors(ctx: ApiContext, includeArchived = false): Promise<Sector[]> {
  let q = ctx.supabase
    .from('sectors')
    .select(`${SECTOR_SELECT}, leads(count)`)
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order')
    .order('name');
  if (!includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as SectorRow[]).map(toSector);
}

function conflictOr(error: Parameters<typeof fromPostgrest>[0]) {
  return error.code === '23505'
    ? new ApiError(409, 'Setor repetido', 'Já existe um setor com esse nome.')
    : fromPostgrest(error, 'Setor não encontrado');
}

export async function createSector(
  ctx: ApiContext,
  input: {
    name: string;
    emoji?: string | null;
    icon?: string | null;
    sort_order?: number;
    priority_rank?: number | null;
    opportunity_notes?: string | null;
    sales_arguments?: string | null;
  },
): Promise<Sector> {
  const slug = slugify(input.name);
  if (!slug) throw new ApiError(400, 'Pedido inválido', 'O nome do setor tem de ter letras ou números.');
  let sortOrder = input.sort_order;
  if (sortOrder === undefined) {
    const { data } = await ctx.supabase
      .from('sectors')
      .select('sort_order')
      .eq('workspace_id', ctx.workspaceId)
      .order('sort_order', { ascending: false })
      .limit(1);
    sortOrder = (data?.[0]?.sort_order ?? 0) + 1;
  }
  const { data, error } = await ctx.supabase
    .from('sectors')
    .insert({ ...input, slug, sort_order: sortOrder, workspace_id: ctx.workspaceId })
    .select(SECTOR_SELECT)
    .single();
  if (error) throw conflictOr(error);
  return toSector(data as SectorRow);
}

export async function updateSector(
  ctx: ApiContext,
  id: string,
  input: Record<string, unknown> & { name?: string; archived?: boolean },
): Promise<Sector> {
  const { archived, ...rest } = input;
  const patch: Record<string, unknown> = { ...rest };
  if (input.name !== undefined) patch.slug = slugify(input.name);
  if (archived !== undefined) patch.archived_at = archived ? new Date().toISOString() : null;
  const { data, error } = await ctx.supabase
    .from('sectors')
    .update(patch)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(`${SECTOR_SELECT}, leads(count)`)
    .maybeSingle();
  if (error) throw conflictOr(error);
  if (!data) throw new ApiError(404, 'Setor não encontrado');
  return toSector(data as SectorRow);
}

export async function deleteSector(ctx: ApiContext, id: string): Promise<void> {
  const sector = unwrap(
    await ctx.supabase
      .from('sectors')
      .select('id, leads(count)')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .maybeSingle(),
    'Setor não encontrado',
  ) as { leads?: { count: number }[] };
  const count = sector.leads?.[0]?.count ?? 0;
  if (count > 0) {
    throw new ApiError(
      409,
      'Setor em uso',
      `Este setor tem ${count} lead(s). Arquiva-o em vez de o apagar.`,
    );
  }
  const { error } = await ctx.supabase.from('sectors').delete().eq('workspace_id', ctx.workspaceId).eq('id', id);
  if (error) throw fromPostgrest(error, 'Setor não encontrado');
}
