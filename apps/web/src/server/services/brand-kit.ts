/**
 * Kit da marca do cliente (logótipos, cores, tipos de letra, links e acessos),
 * guardado no registo principal: o mesmo em todos os projetos do cliente.
 * Ficheiros no bucket privado "brand-kits"; palavras-passe cifradas (AES-256-GCM).
 */
import { randomUUID } from 'node:crypto';
import {
  BRAND_MAX_FILES,
  BRAND_MAX_FILE_BYTES,
  WorkspaceSettingsSchema,
  colorCodes,
  todayIso,
  type BrandKit,
  type BrandKitUpdate,
  type LeadAccess,
  type LeadAccessHandover,
  type LeadAccessUpsert,
} from '@vndesign/core';
import { openSecret, sealSecret } from '../ai/secret-box';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { isUnlocked } from './unlock';
import { renderBrandManualPdf, type BrandManualData } from '../reports/brand-manual-pdf';
import { createSupabaseAdminClient } from '../supabase-admin';
import { createZip, uniqueNames, type ZipEntry } from '../zip';
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

const ACCESS_SELECT =
  'id, lead_id, label, url, username, secret_ciphertext, notes, shared, vault_ref, secret_changed_at, handed_over_at, updated_at';
type AccessRow = Omit<LeadAccess, 'has_secret'> & { lead_id: string; secret_ciphertext: string | null };
const toAccess = (row: AccessRow): LeadAccess => ({
  id: row.id,
  label: row.label,
  url: row.url,
  username: row.username,
  has_secret: !!row.secret_ciphertext,
  notes: row.notes,
  shared: row.shared,
  vault_ref: row.vault_ref,
  secret_changed_at: row.secret_changed_at,
  handed_over_at: row.handed_over_at,
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
    .insert({
      ...rest,
      workspace_id: ctx.workspaceId,
      lead_id: mainId,
      secret_ciphertext: secret ? sealSecret(secret) : null,
      // Para avisar quando a palavra-passe já tem um ano.
      secret_changed_at: secret ? new Date().toISOString() : null,
    })
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
  if (secret === null) {
    patch.secret_ciphertext = null;
    patch.secret_changed_at = null;
  } else if (secret) {
    patch.secret_ciphertext = sealSecret(secret);
    patch.secret_changed_at = new Date().toISOString();
  }
  const { data, error } = await ctx.supabase.from('lead_accesses').update(patch).eq('workspace_id', ctx.workspaceId).eq('id', id).select(ACCESS_SELECT).single();
  if (error) throw fromPostgrest(error);
  return toAccess(data as AccessRow);
}

export async function deleteAccess(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('lead_accesses').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, 'Acesso não encontrado');
}

/**
 * Entregar os acessos ao cliente (fim do trabalho): marca-os como entregues e,
 * por omissão, apaga as palavras-passe guardadas aqui (o acesso fica, com o
 * endereço e o utilizador). Fica registado na linha do tempo.
 */
export async function handOverAccesses(ctx: ApiContext, leadId: string, input: LeadAccessHandover): Promise<LeadAccess[]> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new ApiError(403, 'Sem permissão', 'Só o dono e os administradores entregam os acessos ao cliente.');
  }
  const mainId = await mainClientId(ctx, leadId);
  const patch: Record<string, unknown> = { handed_over_at: new Date().toISOString() };
  if (input.delete_secrets) {
    patch.secret_ciphertext = null;
    patch.secret_changed_at = null;
  }
  const { data, error } = await ctx.supabase
    .from('lead_accesses')
    .update(patch)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', mainId)
    .in('id', input.ids)
    .select(ACCESS_SELECT);
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as AccessRow[];
  if (!rows.length) throw new ApiError(404, 'Acesso não encontrado');
  const { error: logError } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: mainId,
    type: 'accesses_handed_over',
    payload: { labels: rows.map((r) => r.label), deleted_secrets: input.delete_secrets },
    actor_user_id: ctx.user.id,
  });
  if (logError) throw fromPostgrest(logError);
  return rows.map(toAccess);
}

/** A palavra-passe em claro (só a pedido, para mostrar ou copiar). */
export async function revealAccess(ctx: ApiContext, id: string, mustBeShared?: { mainId: string }): Promise<string | null> {
  // Palavras-passe de clientes: só o dono e os administradores (os prospetores
  // não lhes mexem). Os colaboradores usam a rota deles, com os partilhados.
  if (!mustBeShared && ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new ApiError(403, 'Sem permissão', 'Só o dono e os administradores veem as palavras-passe dos acessos.');
  }
  // E só depois de confirmar a palavra-passe da conta (vale alguns minutos).
  if (!mustBeShared && !isUnlocked(ctx.user.id)) {
    throw new ApiError(403, 'Confirma a tua palavra-passe', 'Para ver as palavras-passe dos clientes, confirma primeiro a palavra-passe da tua conta.', { code: 'unlock_required' });
  }
  const row = await getAccessRow(ctx, id);
  if (mustBeShared && (!row.shared || row.lead_id !== mustBeShared.mainId)) throw new ApiError(404, 'Acesso não encontrado');
  if (!row.secret_ciphertext) return null;
  const plain = openSecret(row.secret_ciphertext);
  if (plain === null) throw new ApiError(422, 'Palavra-passe ilegível', 'A chave de cifra do servidor mudou: volta a escrever a palavra-passe.');
  return plain;
}

// -----------------------------------------------------------------------------
// Manual de marca (PDF) e "Descarregar tudo" (ZIP)
// -----------------------------------------------------------------------------

/** O ZIP junta os ficheiros em memória: acima disto, descarregam-se um a um. */
const ZIP_MAX_BYTES = 200 * 1024 * 1024;

async function loadKitAdmin(workspaceId: string, mainId: string): Promise<KitRow | null> {
  const { data } = await createSupabaseAdminClient()
    .from('lead_brand_kits')
    .select('colors, fonts, links, files, notes, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', mainId)
    .maybeSingle();
  return (data as KitRow | null) ?? null;
}

async function fileBytes(path: string): Promise<Buffer> {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(path);
  if (error || !data) throw new ApiError(502, 'Ficheiro indisponível', 'Não foi possível ler um ficheiro do kit. Tenta outra vez.');
  return Buffer.from(await data.arrayBuffer());
}

/** O conteúdo de um ficheiro do kit (no próprio endereço da plataforma: o browser pode lê-lo, ex.: as cores do logótipo). */
export async function brandFileContent(ctx: ApiContext, leadId: string, index: number): Promise<{ name: string; type: string; data: Buffer }> {
  const mainId = await mainClientId(ctx, leadId);
  const file = (await loadKit(ctx, mainId))?.files[index];
  if (!file) throw new ApiError(404, 'Ficheiro não encontrado');
  if (file.size > BRAND_MAX_FILE_BYTES) throw new ApiError(413, 'Ficheiro demasiado grande');
  return { name: file.name, type: file.type, data: await fileBytes(file.path) };
}

const imageFormat = (f: StoredFile): 'png' | 'jpg' | null => {
  const t = f.type.toLowerCase();
  const n = f.name.toLowerCase();
  if (t === 'image/png' || n.endsWith('.png')) return 'png';
  if (t === 'image/jpeg' || /\.jpe?g$/.test(n)) return 'jpg';
  return null;
};

type PreparedBy = BrandManualData['preparedBy'];

async function preparedByFor(workspaceId: string, userId: string | null): Promise<PreparedBy> {
  const { data } = await createSupabaseAdminClient()
    .from('signatures')
    .select('full_name, company, email, website, user_id, is_default')
    .eq('workspace_id', workspaceId)
    .order('is_default', { ascending: false });
  const rows = (data ?? []) as { full_name: string; company: string | null; email: string | null; website: string | null; user_id: string }[];
  const sig = rows.find((r) => r.user_id === userId) ?? rows[0];
  return { name: sig?.full_name ?? '', company: sig?.company ?? null, email: sig?.email ?? null, website: sig?.website ?? null };
}

async function companyOf(workspaceId: string, mainId: string): Promise<string> {
  const { data } = await createSupabaseAdminClient().from('leads').select('company_name').eq('workspace_id', workspaceId).eq('id', mainId).maybeSingle();
  return (data?.company_name as string | undefined) ?? 'Cliente';
}

const fileSlug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'cliente';

async function manualFor(workspaceId: string, mainId: string, kit: KitRow | null, by: PreparedBy): Promise<{ content: Buffer; filename: string; company: string }> {
  const company = await companyOf(workspaceId, mainId);
  const files = kit?.files ?? [];
  // Primeiro os que se chamam "logo…"; no máximo 4 imagens (PNG ou JPEG, até 8 MB cada).
  const images = files
    .filter((f) => imageFormat(f) && f.size <= 8 * 1024 * 1024)
    .sort((a, b) => Number(/log/i.test(b.name)) - Number(/log/i.test(a.name)))
    .slice(0, 4);
  const logos = await Promise.all(images.map(async (f) => ({ name: f.name, data: await fileBytes(f.path), format: imageFormat(f)! })));
  const content = await renderBrandManualPdf({
    company,
    colors: kit?.colors ?? [],
    fonts: kit?.fonts ?? [],
    logos,
    otherFiles: files.filter((f) => !images.includes(f)).map((f) => f.name),
    preparedBy: by,
    today: todayIso(),
  });
  return { content, filename: `Manual-de-marca-${fileSlug(company)}.pdf`, company };
}

/** Manual de marca em PDF, a partir do kit. */
export async function brandManual(ctx: ApiContext, leadId: string): Promise<{ content: Buffer; filename: string }> {
  const mainId = await mainClientId(ctx, leadId);
  const kit = await loadKit(ctx, mainId);
  if (!kit || (!kit.colors.length && !kit.fonts.length && !kit.files.length)) {
    throw new ApiError(422, 'Kit vazio', 'Junta pelo menos o logótipo, as cores ou os tipos de letra ao kit da marca.');
  }
  const { content, filename } = await manualFor(ctx.workspaceId, mainId, kit, await preparedByFor(ctx.workspaceId, ctx.user.id));
  return { content, filename };
}

/** As entregas aprovadas dos projetos do cliente (são links: vão num ficheiro de texto). */
async function approvedDeliverables(workspaceId: string, mainId: string): Promise<{ title: string; url: string | null }[]> {
  const admin = createSupabaseAdminClient();
  const { data: family } = await admin.from('leads').select('id').eq('workspace_id', workspaceId).or(`id.eq.${mainId},client_of.eq.${mainId}`);
  const ids = ((family ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return [];
  const { data } = await admin
    .from('project_deliverables')
    .select('title, url, status, approved_at')
    .eq('workspace_id', workspaceId)
    .in('lead_id', ids)
    .eq('status', 'aprovada')
    .order('approved_at', { ascending: true });
  return ((data ?? []) as { title: string; url: string | null }[]).map((d) => ({ title: d.title, url: d.url }));
}

async function zipFor(workspaceId: string, mainId: string, by: PreparedBy): Promise<{ content: Buffer; filename: string }> {
  const kit = await loadKitAdmin(workspaceId, mainId);
  const files = kit?.files ?? [];
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > ZIP_MAX_BYTES) {
    throw new ApiError(413, 'Kit demasiado grande', 'Os ficheiros do kit passam de 200 MB: descarrega-os um a um.');
  }
  const deliverables = await approvedDeliverables(workspaceId, mainId);
  if (!files.length && !kit?.colors.length && !kit?.fonts.length && !deliverables.length) {
    throw new ApiError(422, 'Kit vazio', 'Ainda não há ficheiros, cores, tipos de letra nem entregas aprovadas para descarregar.');
  }
  const entries: ZipEntry[] = [];
  const names = uniqueNames(files.map((f) => `Kit da marca/${f.name.replace(/[\\/]/g, '-')}`));
  for (const [i, f] of files.entries()) entries.push({ name: names[i]!, data: await fileBytes(f.path) });
  const manual = await manualFor(workspaceId, mainId, kit, by);
  if (kit && (kit.colors.length || kit.fonts.length || kit.files.length)) entries.push({ name: manual.filename, data: manual.content });

  const lines = [`Kit da marca — ${manual.company}`, ''];
  if (kit?.colors.length) {
    lines.push('CORES');
    for (const c of kit.colors) {
      const codes = colorCodes(c.hex);
      lines.push(`- ${c.name || 'Cor'}: ${codes ? `${codes.hex} · RGB ${codes.rgb} · CMYK ${codes.cmyk}` : c.hex}`);
    }
    lines.push('');
  }
  if (kit?.fonts.length) lines.push('TIPOS DE LETRA', ...kit.fonts.map((f) => `- ${f.name}${f.usage ? ` (${f.usage})` : ''}`), '');
  if (kit?.links.length) lines.push('LINKS', ...kit.links.map((l) => `- ${l.label ? `${l.label}: ` : ''}${l.url}`), '');
  if (deliverables.length) lines.push('ENTREGAS APROVADAS', ...deliverables.map((d) => `- ${d.title}${d.url ? `: ${d.url}` : ''}`), '');
  lines.push(`Preparado por ${by.company ?? by.name}${by.website ? ` · ${by.website}` : ''}${by.email ? ` · ${by.email}` : ''}`);
  entries.push({ name: 'Leia-me.txt', data: Buffer.from(lines.join('\r\n'), 'utf8') });
  return { content: createZip(entries), filename: `Kit-da-marca-${fileSlug(manual.company)}.zip` };
}

/** "Descarregar tudo": os ficheiros do kit, o manual de marca e um resumo (cores, tipos de letra, links e entregas). */
export async function brandKitZip(ctx: ApiContext, leadId: string): Promise<{ content: Buffer; filename: string }> {
  const mainId = await mainClientId(ctx, leadId);
  // Confirma o acesso com o cliente da pessoa (RLS) antes de ler com a chave de serviço.
  await loadKit(ctx, mainId);
  return zipFor(ctx.workspaceId, mainId, await preparedByFor(ctx.workspaceId, ctx.user.id));
}

/** O mesmo ZIP na página do cliente (link /p/<código>); null se a página não existir ou estiver desligada. */
export async function sharedBrandKitZip(token: string): Promise<{ content: Buffer; filename: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin.from('lead_projects').select('lead_id, workspace_id').eq('share_token', token).maybeSingle();
  if (!project) return null;
  const ws = project.workspace_id as string;
  const [{ data: workspace }, { data: lead }] = await Promise.all([
    admin.from('workspaces').select('settings').eq('id', ws).maybeSingle(),
    admin.from('leads').select('id, client_of, created_by, archived_at, anonymized_at').eq('workspace_id', ws).eq('id', project.lead_id as string).maybeSingle(),
  ]);
  if (!workspace || !lead || lead.anonymized_at || lead.archived_at) return null;
  const features = WorkspaceSettingsSchema.parse(workspace.settings ?? {}).features;
  if (!features.projects || !features.client_page || !features.brand_kit) return null;
  const mainId = (lead.client_of as string | null) ?? (lead.id as string);
  return zipFor(ws, mainId, await preparedByFor(ws, (lead.created_by as string | null) ?? null));
}
