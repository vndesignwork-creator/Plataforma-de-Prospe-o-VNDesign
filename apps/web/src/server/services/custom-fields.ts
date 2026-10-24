/**
 * Campos personalizados do workspace: criar, mudar o nome/opções/ordem e apagar
 * (apagar tira o valor de todos os leads). O tipo não muda depois de criado.
 */
import { newCustomFieldKey, type CustomField, type CustomFieldCreateSchema, type CustomFieldUpdateSchema } from '@vndesign/core';
import type { z } from 'zod';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';

const SELECT = 'id, key, label, type, options, sort_order';
const NOT_FOUND = 'Campo não encontrado';

export async function listCustomFields(ctx: ApiContext): Promise<CustomField[]> {
  const { data, error } = await ctx.supabase
    .from('custom_fields')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order')
    .order('created_at');
  if (error) throw fromPostgrest(error);
  return (data ?? []) as CustomField[];
}

export async function createCustomField(ctx: ApiContext, input: z.output<typeof CustomFieldCreateSchema>): Promise<CustomField> {
  const existing = await listCustomFields(ctx);
  if (existing.length >= 30) throw new ApiError(422, 'Demasiados campos', 'No máximo 30 campos personalizados.');
  if (existing.some((f) => f.label.toLowerCase() === input.label.toLowerCase())) {
    throw new ApiError(409, 'Já existe', `Já há um campo “${input.label}”.`, { errors: { label: ['Já há um campo com este nome.'] } });
  }
  const result = await ctx.supabase
    .from('custom_fields')
    .insert({
      workspace_id: ctx.workspaceId,
      key: newCustomFieldKey(),
      label: input.label,
      type: input.type,
      options: input.type === 'choice' ? input.options : [],
      sort_order: Math.max(0, ...existing.map((f) => f.sort_order)) + 1,
    })
    .select(SELECT)
    .single();
  return unwrap(result) as CustomField;
}

export async function updateCustomField(ctx: ApiContext, id: string, patch: z.output<typeof CustomFieldUpdateSchema>): Promise<CustomField> {
  const current = unwrap(
    await ctx.supabase.from('custom_fields').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(),
    NOT_FOUND,
  ) as CustomField;
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.sort_order !== undefined) update.sort_order = patch.sort_order;
  if (patch.options !== undefined && current.type === 'choice') {
    if (patch.options.length < 2) throw new ApiError(422, 'Opções a mais apagadas', 'Uma escolha precisa de pelo menos 2 opções.');
    update.options = patch.options;
  }
  if (!Object.keys(update).length) return current;
  const result = await ctx.supabase.from('custom_fields').update(update).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).maybeSingle();
  return unwrap(result, NOT_FOUND) as CustomField;
}

export async function deleteCustomField(ctx: ApiContext, id: string): Promise<void> {
  const field = unwrap(
    await ctx.supabase.from('custom_fields').select('key').eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(),
    NOT_FOUND,
  ) as { key: string };
  const { error } = await ctx.supabase.from('custom_fields').delete().eq('workspace_id', ctx.workspaceId).eq('id', id);
  if (error) throw fromPostgrest(error, NOT_FOUND);
  const drop = await ctx.supabase.rpc('custom_field_drop_values', { p_workspace_id: ctx.workspaceId, p_key: field.key });
  if (drop.error) throw fromPostgrest(drop.error);
}
