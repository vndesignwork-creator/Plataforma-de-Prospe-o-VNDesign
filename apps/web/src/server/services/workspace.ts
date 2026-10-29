import { WorkspaceSettingsSchema, type Me, type PomodoroSettings, type QuoteSettings, type Signature, type WorkspaceSettings } from '@vndesign/core';
import { assertAiProviderExists } from '../ai/providers';
import { getProfile } from './profile';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';

export async function getMe(ctx: ApiContext): Promise<Me> {
  const profile = getProfile(ctx);
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
    profile: await profile,
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

// -----------------------------------------------------------------------------
// Definições do workspace
// -----------------------------------------------------------------------------
export async function getSettings(ctx: ApiContext): Promise<WorkspaceSettings> {
  const row = unwrap(
    await ctx.supabase.from('workspaces').select('settings').eq('id', ctx.workspaceId).maybeSingle(),
    'Workspace não encontrado',
  ) as { settings: unknown };
  return WorkspaceSettingsSchema.parse(row.settings ?? {});
}

export async function updateSettings(
  ctx: ApiContext,
  patch: Partial<Pick<WorkspaceSettings, 'follow_up_days' | 'work_weekends' | 'follow_up_sequence' | 'auto_archive_days' | 'activity_cleanup_months' | 'opt_out_line' | 'proposal'>> & {
    daily_digest?: { enabled: boolean; recipient: string | null };
    ai?: Partial<WorkspaceSettings['ai']>;
    features?: Partial<WorkspaceSettings['features']>;
    google_review_url?: string | null;
    project_kickoff?: { payment_split: number[] };
    briefing?: { questions: string[] };
    contract?: { provider_nif: string; clauses: string };
    quote?: QuoteSettings;
    pomodoro?: PomodoroSettings;
    weekly_backup?: { enabled: boolean; recipient: string | null; weekday: number };
    prospecting_sequence?: WorkspaceSettings['prospecting_sequence'];
  },
): Promise<WorkspaceSettings> {
  if (ctx.role === 'member') throw new ApiError(403, 'Sem permissão', 'Só o dono ou um administrador pode alterar as definições.');
  const current = await getSettings(ctx);
  for (const feature of [patch.ai?.email, patch.ai?.lead_generation]) {
    if (feature) await assertAiProviderExists(ctx, feature.provider);
  }
  const next = {
    ...current,
    ...patch,
    ai: { ...current.ai, ...patch.ai },
    features: { ...current.features, ...patch.features },
    // last_sent_at é só do servidor (cópia de segurança semanal).
    weekly_backup: { ...current.weekly_backup, ...patch.weekly_backup },
  };
  const { error } = await ctx.supabase.from('workspaces').update({ settings: next }).eq('id', ctx.workspaceId);
  if (error) throw fromPostgrest(error);
  return WorkspaceSettingsSchema.parse(next);
}

// -----------------------------------------------------------------------------
// Assinatura do utilizador atual
// -----------------------------------------------------------------------------
const SIGNATURE_SELECT = 'full_name, role_title, company, phone, email, website, portfolio_url, design_portfolio_url, project_links';

export async function getSignature(ctx: ApiContext): Promise<Signature> {
  const { data, error } = await ctx.supabase
    .from('signatures')
    .select(SIGNATURE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) {
    return {
      full_name: ctx.user.email?.split('@')[0] ?? '',
      role_title: null,
      company: null,
      phone: null,
      email: ctx.user.email,
      website: null,
      portfolio_url: null,
      design_portfolio_url: null,
      project_links: [],
    };
  }
  return data as Signature;
}

export async function updateSignature(ctx: ApiContext, patch: Partial<Signature>): Promise<Signature> {
  const { data: existing, error } = await ctx.supabase
    .from('signatures')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (existing) {
    const { error: e } = await ctx.supabase.from('signatures').update(patch).eq('id', existing.id);
    if (e) throw fromPostgrest(e);
  } else {
    const current = await getSignature(ctx);
    const { error: e } = await ctx.supabase
      .from('signatures')
      .insert({ ...current, ...patch, workspace_id: ctx.workspaceId, user_id: ctx.user.id, is_default: true });
    if (e) throw fromPostgrest(e);
  }
  return getSignature(ctx);
}
