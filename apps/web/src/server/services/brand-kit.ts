/**
 * Kit da marca do cliente (logótipos, cores, tipos de letra, links e acessos),
 * guardado no registo principal: o mesmo em todos os projetos do cliente.
 * Ficheiros no bucket privado "brand-kits"; palavras-passe cifradas (AES-256-GCM).
 */
import { randomUUID } from 'node:crypto';
import {
  BRAND_MAX_FILES,
  BRAND_MAX_FILE_BYTES,
  type BrandKit,
  type BrandKitUpdate,
  type LeadAccess,
  type LeadAccessUpsert,
} from '@vndesign/core';
import { openSecret, sealSecret } from '../ai/secret-box';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { mainClientId } from './client-projects';

const BUCKET = 'brand-kits';
type StoredFile = { name: string; path: string; size: number; type: string };
type KitRow = Omit<BrandKit, 'main_id' | 'files'> & { files: StoredFile[] };

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80) || 'ficheiro';

async function loadKit(ctx: ApiContext, mainId: string): Promise<KitRow | null> {
  const { data, error } = await ctx.supabase
    .from('lead_brand_kits')
    .select('colors, fonts, links, files, notes, updated_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', mainId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  return (data as KitRow | null) ?? null;
}

/** O kit como a API o devolve (os ficheiros passam a links da API). */
export function toBrandKit(mainId: string, row: KitRow | null, fileUrl: (i: number) => string): BrandKit {
  return {
    main_id: mainId,
    colors: row?.colors ?? [],
    fonts: row?.fonts ?? [],
    links: row?.links ?? [],
    files: (row?.files ?? []).map((f, i) => ({ name: f.name, size: f.size, type: f.type, url: fileUrl(i) })),
    notes: row?.notes ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

const ownerFileUrl = (mainId: string) => (i: number) => `/api/v1/leads/${mainId}/brand-kit/files/${i}`;

export async function getBrandKit(ctx: ApiContext, leadId: string): Promise<BrandKit> {
  const mainId = await mainClientId(ctx, leadId);
  return toBrandKit(mainId, await loadKit(ctx, mainId), ownerFileUrl(mainId));
}

async function saveKit(ctx: ApiContext, mainId: string, patch: Partial<KitRow>): Promise<BrandKit> {
  const { data, error } = await ctx.supabase
    .from('lead_brand_kits')
    .upsert({ lead_id: mainId, workspace_id: ctx.workspaceId, ...patch }, { onConflict: 'lead_id' })
    .select('colors, fonts, links, files, notes, updated_at')
    .single();
  if (error) throw fromPostgrest(error);
  return toBrandKit(mainId, data as KitRow, ownerFileUrl(mainId));
}

export async function updateBrandKit(ctx: ApiContext, leadId: string, input: BrandKitUpdate): Promise<BrandKit> {
  const mainId = await mainClientId(ctx, leadId);
  const patch: Partial<KitRow> = {};
  if (input.colors) patch.colors = input.colors;
  if (input.fonts) patch.fonts = input.fonts;
  if (input.links) patch.links = input.links;
  if (input.notes !== undefined) patch.notes = input.notes;
  return saveKit(ctx, mainId, patch);
}

export async function addBrandFiles(ctx: ApiContext, leadId: string, form: FormData): Promise<BrandKit> {
  const mainId = await mainClientId(ctx, leadId);
  const current = await loadKit(ctx, mainId);
  const uploads = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!uploads.length) throw new ApiError(422, 'Sem ficheiros', 'Escolhe pelo menos um ficheiro.');
  if ((current?.files.length ?? 0) + uploads.length > BRAND_MAX_FILES) {
    throw new ApiError(422, 'Demasiados ficheiros', `O kit guarda até ${BRAND_MAX_FILES} ficheiros.`);
  }
  const big = uploads.find((f) => f.size > BRAND_MAX_FILE_BYTES);
  if (big) throw new ApiError(422, 'Ficheiro demasiado grande', `"${big.name}" tem mais de 25 MB.`);
  const admin = createSupabaseAdminClient();
  const added: StoredFile[] = [];
  for (const file of uploads) {
    const path = `${ctx.workspaceId}/${mainId}/${randomUUID()}-${safeName(file.name)}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) throw new ApiError(502, 'Falha no envio', `Não foi possível guardar "${file.name}". Tenta outra vez.`);
    added.push({ name: file.name.slice(0, 200), path, size: file.size, type: file.type || 'application/octet-stream' });
  }
  return saveKit(ctx, mainId, { files: [...(current?.files ?? []), ...added] });
}

export async function deleteBrandFile(ctx: ApiContext, leadId: string, index: number): Promise<BrandKit> {
  const mainId = await mainClientId(ctx, leadId);
  const current = await loadKit(ctx, mainId);
  const file = current?.files[index];
  if (!file) throw new ApiError(404, 'Ficheiro não encontrado');
  await createSupabaseAdminClient().storage.from(BUCKET).remove([file.path]);
  return saveKit(ctx, mainId, { files: current!.files.filter((_, i) => i !== index) });
}

/** Link temporário (10 minutos) para descarregar um ficheiro do kit (do registo principal indicado). */
export async function brandFileUrlFor(ctx: ApiContext, mainId: string, index: number): Promise<string> {
  const file = (await loadKit(ctx, mainId))?.files[index];
  if (!file) throw new ApiError(404, 'Ficheiro não encontrado');
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(file.path, 600, { download: file.name });
  if (error || !data) throw new ApiError(502, 'Ficheiro indisponível', 'Não foi possível abrir o ficheiro. Tenta outra vez.');
  return data.signedUrl;
}

export async function brandFileUrl(ctx: ApiContext, leadId: string, index: number): Promise<string> {
  return brandFileUrlFor(ctx, await mainClientId(ctx, leadId), index);
}

// -----------------------------------------------------------------------------
// Acessos (domínio, alojamento, redes…)
// -----------------------------------------------------------------------------

const ACCESS_SELECT = 'id, lead_id, label, url, username, secret_ciphertext, notes, shared, updated_at';
type AccessRow = Omit<LeadAccess, 'has_secret'> & { lead_id: string; secret_ciphertext: string | null };
const toAccess = (row: AccessRow): LeadAccess => ({
  id: row.id,
  label: row.label,
  url: row.url,
  username: row.username,
  has_secret: !!row.secret_ciphertext,
  notes: row.notes,
  shared: row.shared,
  updated_at: row.updated_at,
});

export async function listAccessesFor(ctx: ApiContext, mainId: string, onlyShared = false): Promise<LeadAccess[]> {
  let query = ctx.supabase.from('lead_accesses').select(ACCESS_SELECT).eq('workspace_id', ctx.workspaceId).eq('lead_id', mainId).order('label');
  if (onlyShared) query = query.eq('shared', true);
  const { data, error } = await query;
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as AccessRow[]).map(toAccess);
}

export async function listAccesses(ctx: ApiContext, leadId: string): Promise<LeadAccess[]> {
  return listAccessesFor(ctx, await mainClientId(ctx, leadId));
}

export async function createAccess(ctx: ApiContext, leadId: string, input: LeadAccessUpsert): Promise<LeadAccess> {
  const mainId = await mainClientId(ctx, leadId);
  const { secret, ...rest } = input;
  const { data, error } = await ctx.supabase
    .from('lead_accesses')
    .insert({ ...rest, workspace_id: ctx.workspaceId, lead_id: mainId, secret_ciphertext: secret ? sealSecret(secret) : null })
    .select(ACCESS_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return toAccess(data as AccessRow);
}

async function getAccessRow(ctx: ApiContext, id: string): Promise<AccessRow> {
  const { data, error } = await ctx.supabase.from('lead_accesses').select(ACCESS_SELECT).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw new ApiError(404, 'Acesso não encontrado');
  return data as AccessRow;
}

export async function updateAccess(ctx: ApiContext, id: string, input: LeadAccessUpsert): Promise<LeadAccess> {
  await getAccessRow(ctx, id);
  const { secret, ...rest } = input;
  const patch: Record<string, unknown> = { ...rest };
  // Vazio (ou ausente) mantém a palavra-passe; null apaga-a.
  if (secret === null) patch.secret_ciphertext = null;
  else if (secret) patch.secret_ciphertext = sealSecret(secret);
  const { data, error } = await ctx.supabase.from('lead_accesses').update(patch).eq('workspace_id', ctx.workspaceId).eq('id', id).select(ACCESS_SELECT).single();
  if (error) throw fromPostgrest(error);
  return toAccess(data as AccessRow);
}

export async function deleteAccess(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('lead_accesses').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, 'Acesso não encontrado');
}

/** A palavra-passe em claro (só a pedido, para mostrar ou copiar). */
export async function revealAccess(ctx: ApiContext, id: string, mustBeShared?: { mainId: string }): Promise<string | null> {
  const row = await getAccessRow(ctx, id);
  if (mustBeShared && (!row.shared || row.lead_id !== mustBeShared.mainId)) throw new ApiError(404, 'Acesso não encontrado');
  if (!row.secret_ciphertext) return null;
  const plain = openSecret(row.secret_ciphertext);
  if (plain === null) throw new ApiError(422, 'Palavra-passe ilegível', 'A chave de cifra do servidor mudou: volta a escrever a palavra-passe.');
  return plain;
}
