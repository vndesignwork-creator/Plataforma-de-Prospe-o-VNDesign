/**
 * Perfil de cada pessoa no workspace: alcunha e foto (tabela user_profiles,
 * fotos no armazenamento privado "avatars", servidas por links temporários).
 */
import { randomUUID } from 'node:crypto';
import { AVATAR_MAX_BYTES, AVATAR_TYPES, profileName, type Profile, type ProfileUpdateInput } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';

const BUCKET = 'avatars';
type Row = { user_id: string; display_name: string | null; avatar_path: string | null; updated_at: string };

/** Endereço da foto (muda quando a foto muda, para o browser não mostrar a antiga). */
export const avatarUrl = (row: Pick<Row, 'user_id' | 'avatar_path' | 'updated_at'> | null | undefined) =>
  row?.avatar_path ? `/api/v1/avatars/${row.user_id}?v=${new Date(row.updated_at).getTime()}` : null;

async function loadRow(ctx: ApiContext, userId: string): Promise<Row | null> {
  const { data, error } = await ctx.supabase
    .from('user_profiles')
    .select('user_id, display_name, avatar_path, updated_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  return (data as Row | null) ?? null;
}

/** Perfis de toda a equipa (para os nomes do "Responsável" e as fotos). */
export async function teamProfiles(ctx: ApiContext): Promise<Map<string, Row>> {
  const { data, error } = await ctx.supabase
    .from('user_profiles')
    .select('user_id, display_name, avatar_path, updated_at')
    .eq('workspace_id', ctx.workspaceId);
  if (error) throw fromPostgrest(error);
  return new Map(((data ?? []) as Row[]).map((r) => [r.user_id, r]));
}

export async function getProfile(ctx: ApiContext): Promise<Profile> {
  const [row, sig] = await Promise.all([
    loadRow(ctx, ctx.user.id),
    ctx.supabase.from('signatures').select('full_name').eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id).maybeSingle(),
  ]);
  const fullName = (sig.data as { full_name: string | null } | null)?.full_name ?? null;
  return {
    name: profileName(row?.display_name, fullName, ctx.user.email),
    display_name: row?.display_name ?? null,
    avatar_url: avatarUrl(row),
  };
}

async function save(ctx: ApiContext, patch: Partial<Pick<Row, 'display_name' | 'avatar_path'>>) {
  const { error } = await ctx.supabase
    .from('user_profiles')
    .upsert({ workspace_id: ctx.workspaceId, user_id: ctx.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,user_id' });
  if (error) throw fromPostgrest(error);
}

export async function updateProfile(ctx: ApiContext, input: ProfileUpdateInput): Promise<Profile> {
  await save(ctx, { display_name: input.display_name ?? null });
  return getProfile(ctx);
}

/** Foto nova (JPEG, PNG ou WebP até 1 MB); a antiga é apagada. */
export async function setAvatar(ctx: ApiContext, file: File | null): Promise<Profile> {
  if (!file || !file.size) throw new ApiError(422, 'Sem foto', 'Escolhe uma imagem.');
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) throw new ApiError(422, 'Formato inválido', 'A foto tem de ser JPEG, PNG ou WebP.');
  if (file.size > AVATAR_MAX_BYTES) throw new ApiError(422, 'Foto demasiado grande', 'A foto tem de ter até 1 MB.');
  const before = await loadRow(ctx, ctx.user.id);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${ctx.workspaceId}/${ctx.user.id}/${randomUUID()}.${ext}`;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw new ApiError(502, 'Falha no envio', 'Não foi possível guardar a foto. Tenta outra vez.');
  await save(ctx, { avatar_path: path });
  if (before?.avatar_path) await admin.storage.from(BUCKET).remove([before.avatar_path]);
  return getProfile(ctx);
}

export async function removeAvatar(ctx: ApiContext): Promise<Profile> {
  const before = await loadRow(ctx, ctx.user.id);
  if (before?.avatar_path) {
    await save(ctx, { avatar_path: null });
    await createSupabaseAdminClient().storage.from(BUCKET).remove([before.avatar_path]);
  }
  return getProfile(ctx);
}

/** Link temporário para a foto de alguém da equipa (o RLS só deixa ver as do próprio workspace). */
export async function avatarSignedUrl(ctx: ApiContext, userId: string): Promise<string> {
  const row = await loadRow(ctx, userId);
  if (!row?.avatar_path) throw new ApiError(404, 'Sem foto');
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(row.avatar_path, 3600);
  if (error || !data) throw new ApiError(502, 'Foto indisponível');
  return data.signedUrl;
}
