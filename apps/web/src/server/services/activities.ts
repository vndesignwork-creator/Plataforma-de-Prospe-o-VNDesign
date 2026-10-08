import type { Activity } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { getLead } from './leads';

const ACTIVITY_SELECT = 'id, lead_id, type, body, payload, actor_user_id, created_at';

export async function listActivities(ctx: ApiContext, leadId: string): Promise<Activity[]> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('lead_activities')
    .select(ACTIVITY_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw fromPostgrest(error);
  return (data ?? []) as Activity[];
}

export async function createActivity(
  ctx: ApiContext,
  leadId: string,
  input: { type: string; body?: string | null; payload?: Record<string, unknown> },
): Promise<Activity> {
  await getLead(ctx, leadId);
  const result = await ctx.supabase
    .from('lead_activities')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      type: input.type,
      body: input.body ?? null,
      payload: input.payload ?? {},
      actor_user_id: ctx.user.id,
    })
    .select(ACTIVITY_SELECT)
    .single();
  return unwrap(result) as Activity;
}

/** Só as notas do próprio utilizador podem ser apagadas (garantido também pelo RLS). */
export async function deleteNote(ctx: ApiContext, leadId: string, activityId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('lead_activities')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .eq('id', activityId)
    .eq('type', 'note')
    .select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, 'Nota não encontrada');
}
