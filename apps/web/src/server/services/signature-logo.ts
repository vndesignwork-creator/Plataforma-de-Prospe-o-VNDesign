/**
 * Logótipo da assinatura: guardado no armazenamento privado "signature-logos";
 * na plataforma é servido por links temporários e, nos emails aos leads, vai
 * embutido (anexo inline) por baixo da assinatura.
 */
import { randomUUID } from 'node:crypto';
import { SIGNATURE_LOGO_CID, SIGNATURE_LOGO_MAX_BYTES, SIGNATURE_LOGO_TYPES, addSignatureLogo, formatSignature, type Signature } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getSignature, updateSignature } from './workspace';

const BUCKET = 'signature-logos';
type Row = { id: string; logo_path: string | null; logo_width: number };

async function loadRow(ctx: ApiContext): Promise<Row | null> {
  const { data, error } = await ctx.supabase
    .from('signatures')
    .select('id, logo_path, logo_width')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  return (data as Row | null) ?? null;
}

async function saveLogoPath(ctx: ApiContext, logoPath: string | null) {
  let row = await loadRow(ctx);
  if (!row) {
    // Ainda sem assinatura guardada: cria-a com os dados por omissão.
    await updateSignature(ctx, {});
    row = await loadRow(ctx);
  }
  if (!row) throw new ApiError(500, 'Assinatura indisponível');
  const { error } = await ctx.supabase.from('signatures').update({ logo_path: logoPath }).eq('id', row.id);
  if (error) throw fromPostgrest(error);
}

/** Logótipo novo (PNG, JPEG ou GIF até 1 MB); o antigo é apagado. */
export async function setSignatureLogo(ctx: ApiContext, file: File | null): Promise<Signature> {
  if (!file || !file.size) throw new ApiError(422, 'Sem imagem', 'Escolhe uma imagem.');
  if (!(SIGNATURE_LOGO_TYPES as readonly string[]).includes(file.type)) {
    throw new ApiError(422, 'Formato inválido', 'O logótipo tem de ser PNG, JPEG ou GIF.');
  }
  if (file.size > SIGNATURE_LOGO_MAX_BYTES) throw new ApiError(422, 'Imagem demasiado grande', 'O logótipo tem de ter até 1 MB.');
  const before = await loadRow(ctx);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/gif' ? 'gif' : 'jpg';
  const path = `${ctx.workspaceId}/${ctx.user.id}/${randomUUID()}.${ext}`;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw new ApiError(502, 'Falha no envio', 'Não foi possível guardar o logótipo. Tenta outra vez.');
  await saveLogoPath(ctx, path);
  if (before?.logo_path) await admin.storage.from(BUCKET).remove([before.logo_path]);
  return getSignature(ctx);
}

export async function removeSignatureLogo(ctx: ApiContext): Promise<Signature> {
  const before = await loadRow(ctx);
  if (before?.logo_path) {
    await saveLogoPath(ctx, null);
    await createSupabaseAdminClient().storage.from(BUCKET).remove([before.logo_path]);
  }
  return getSignature(ctx);
}

/** Link temporário para o logótipo de quem pede (para a pré-visualização). */
export async function signatureLogoSignedUrl(ctx: ApiContext): Promise<string> {
  const row = await loadRow(ctx);
  if (!row?.logo_path) throw new ApiError(404, 'Sem logótipo');
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(row.logo_path, 3600);
  if (error || !data) throw new ApiError(502, 'Logótipo indisponível');
  return data.signedUrl;
}

export type InlineAttachment = { filename: string; content: Buffer; contentType: string; cid: string };

/**
 * Junta o logótipo ao HTML do email, por baixo da assinatura (se a assinatura
 * estiver no email). Sem logótipo, sem assinatura no email ou se a imagem falhar,
 * o email segue igual.
 */
export async function withSignatureLogo(ctx: ApiContext, html: string): Promise<{ html: string; attachment: InlineAttachment | null }> {
  const row = await loadRow(ctx);
  if (!row?.logo_path) return { html, attachment: null };
  const signature = await getSignature(ctx);
  const alt = signature.company || signature.full_name || 'Logótipo';
  const withLogo = addSignatureLogo(html, formatSignature(signature), {
    src: `cid:${SIGNATURE_LOGO_CID}`,
    width: row.logo_width,
    alt,
    href: signature.website,
  });
  if (!withLogo) return { html, attachment: null };
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(row.logo_path);
  if (error || !data) {
    console.warn('[assinatura] logótipo indisponível', error?.message);
    return { html, attachment: null };
  }
  const ext = row.logo_path.split('.').pop() ?? 'png';
  return {
    html: withLogo,
    attachment: {
      filename: `logotipo.${ext}`,
      content: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || `image/${ext}`,
      cid: SIGNATURE_LOGO_CID,
    },
  };
}
