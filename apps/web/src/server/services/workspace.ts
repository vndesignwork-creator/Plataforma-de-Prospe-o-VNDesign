import { WorkspaceSettingsSchema, type Me } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest, unwrap } from '../http';

export async function getMe(ctx: ApiContext): Promise<Me> {
  const workspace = unwrap(
    await ctx.supabase
      .from('workspaces')
      .select('id, name, settings')
      .eq('id', ctx.workspaceId)
      .maybeSingle(),
    'Workspace não encontrado',
  ) as { id: string; name: string; settings: unknown };
  return {
    user: ctx.user,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      settings: WorkspaceSettingsSchema.parse(workspace.settings ?? {}),
    },
    role: ctx.role,
  };
}

export async function getPreference(ctx: ApiContext, key: string): Promise<unknown> {
  const { data, error } = await ctx.supabase
    .from('user_preferences')
    .select('value')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .eq('key', key)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  return data?.value ?? null;
}

export async function setPreference(ctx: ApiContext, key: string, value: unknown): Promise<unknown> {
  const { error } = await ctx.supabase.from('user_preferences').upsert({
    workspace_id: ctx.workspaceId,
    user_id: ctx.user.id,
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw fromPostgrest(error);
  return value;
}
