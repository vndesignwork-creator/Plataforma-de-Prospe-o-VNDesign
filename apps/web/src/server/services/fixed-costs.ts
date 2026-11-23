/**
 * Custos fixos mensais do negócio (alojamento, software…). Guardam-se por mês
 * ("AAAA-MM") no primeiro dia do mês, para a base de dados os ordenar e
 * comparar com datas.
 */
import { FixedCostInputSchema, type FixedCost, type FixedCostInput } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';

const SELECT = 'id, description, amount, starts_on, ends_on, note';
const NOT_FOUND = 'Custo fixo não encontrado';

/** "AAAA-MM" ↔ "AAAA-MM-01" (a base de dados guarda datas). */
const toDate = (month: string) => `${month}-01`;
const toMonth = (date: string) => date.slice(0, 7);

type Row = { id: string; description: string; amount: number | string; starts_on: string; ends_on: string | null; note: string | null };

function toFixedCost(row: Row): FixedCost {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    starts_on: toMonth(row.starts_on),
    ends_on: row.ends_on ? toMonth(row.ends_on) : null,
    note: row.note,
  };
}

/** Só o dono e os administradores: são números do negócio. */
function assertCanManage(ctx: ApiContext) {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new ApiError(403, 'Sem permissão', 'Só o dono e os administradores mexem nos custos fixos.');
  }
}

export async function listFixedCosts(ctx: ApiContext): Promise<FixedCost[]> {
  assertCanManage(ctx);
  const { data, error } = await ctx.supabase
    .from('fixed_costs')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('starts_on', { ascending: false })
    .limit(500);
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map(toFixedCost);
}

export async function createFixedCost(ctx: ApiContext, input: FixedCostInput): Promise<FixedCost> {
  assertCanManage(ctx);
  const value = FixedCostInputSchema.parse(input);
  const result = await ctx.supabase
    .from('fixed_costs')
    .insert({
      workspace_id: ctx.workspaceId,
      description: value.description,
      amount: value.amount,
      starts_on: toDate(value.starts_on),
      ends_on: value.ends_on ? toDate(value.ends_on) : null,
      note: value.note,
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  return toFixedCost(unwrap(result) as Row);
}

export async function updateFixedCost(ctx: ApiContext, id: string, input: FixedCostInput): Promise<FixedCost> {
  assertCanManage(ctx);
  const value = FixedCostInputSchema.parse(input);
  const result = await ctx.supabase
    .from('fixed_costs')
    .update({
      description: value.description,
      amount: value.amount,
      starts_on: toDate(value.starts_on),
      ends_on: value.ends_on ? toDate(value.ends_on) : null,
      note: value.note,
    })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  return toFixedCost(unwrap(result, NOT_FOUND) as Row);
}

export async function deleteFixedCost(ctx: ApiContext, id: string): Promise<void> {
  assertCanManage(ctx);
  const { data, error } = await ctx.supabase
    .from('fixed_costs')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
}

/** Os custos fixos que valem num mês ("AAAA-MM"), para os relatórios. */
export async function fixedCostsOfMonth(ctx: ApiContext, month: string): Promise<FixedCost[]> {
  const first = toDate(month);
  const { data, error } = await ctx.supabase
    .from('fixed_costs')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .lte('starts_on', first)
    .or(`ends_on.is.null,ends_on.gte.${first}`)
    .order('amount', { ascending: false })
    .limit(500);
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map(toFixedCost);
}
