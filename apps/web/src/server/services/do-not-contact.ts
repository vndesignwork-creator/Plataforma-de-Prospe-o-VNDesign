import type { DoNotContact } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';

const DNC_SELECT = 'id, company_name, website, email, reason, created_at';

export async function listDoNotContact(ctx: ApiContext): Promise<DoNotContact[]> {
  const { data, error } = await ctx.supabase
    .from('do_not_contact')
    .select(DNC_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw fromPostgrest(error);
  return (data ?? []) as DoNotContact[];
}

export async function addDoNotContact(
  ctx: ApiContext,
  input: { company_name: string; website?: string | null; email?: string | null; reason?: string | null },
): Promise<DoNotContact> {
  const result = await ctx.supabase
    .from('do_not_contact')
    .insert({ ...input, workspace_id: ctx.workspaceId, created_by: ctx.user.id })
    .select(DNC_SELECT)
    .single();
  return unwrap(result) as DoNotContact;
}

export async function removeDoNotContact(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('do_not_contact')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, 'Entrada não encontrada');
}
