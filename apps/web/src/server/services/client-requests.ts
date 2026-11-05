/**
 * O que falta o cliente enviar: na ficha do projeto (lista, juntar, marcar
 * recebido) e na página do cliente (/p/<código>: marcar como enviado, escrever
 * uma nota e juntar ficheiros, que ficam no armazenamento privado).
 */
import { randomUUID } from 'node:crypto';
import {
  CLIENT_REQUEST_MAX_FILES,
  CLIENT_REQUEST_MAX_FILE_BYTES,
  WorkspaceSettingsSchema,
  leadPath,
  type ClientRequest,
  type SharedClientRequest,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { createActivity } from './activities';
import { alertUser } from './push';

const BUCKET = 'brand-kits';
const SELECT = 'id, lead_id, title, note, status, client_note, files, sent_at, created_at, updated_at';
const NOT_FOUND = 'Pedido não encontrado';
type StoredFile = { name: string; path: string; size: number; type: string };
type Row = Omit<ClientRequest, 'files'> & { files: StoredFile[] };

const publicFiles = (files: StoredFile[]) => files.map(({ name, size, type }) => ({ name, size, type }));
const toRequest = (r: Row): ClientRequest => ({ ...r, files: publicFiles(r.files ?? []) });
const missingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';

export async function listClientRequests(ctx: ApiContext, leadId: string): Promise<ClientRequest[]> {
  const { data, error } = await ctx.supabase
    .from('client_requests')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('position')
    .order('created_at');
  // Antes da migração 20261108002500: lista vazia.
  if (missingTable(error)) return [];
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map(toRequest);
}

export async function createClientRequest(ctx: ApiContext, leadId: string, input: { title: string; note: string | null }): Promise<ClientRequest> {
  const { data: last } = await ctx.supabase
    .from('client_requests')
    .select('position')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('position', { ascending: false })
    .limit(1);
  const result = await ctx.supabase
    .from('client_requests')
    .insert({ workspace_id: ctx.workspaceId, lead_id: leadId, title: input.title, note: input.note, position: ((last?.[0]?.position as number | undefined) ?? 0) + 1 })
    .select(SELECT)
    .single();
  if (missingTable(result.error)) throw new ApiError(503, 'Ainda não disponível', 'A base de dados ainda não foi atualizada (npx supabase db push).');
  return toRequest(unwrap(result) as Row);
}

export async function updateClientRequest(ctx: ApiContext, id: string, patch: { title?: string; note?: string | null; status?: ClientRequest['status'] }): Promise<ClientRequest> {
  const update: Record<string, unknown> = { ...patch };
  if (patch.status === 'pending') update.sent_at = null;
  const result = await ctx.supabase.from('client_requests').update(update).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).maybeSingle();
  return toRequest(unwrap(result, NOT_FOUND) as Row);
}

export async function deleteClientRequest(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('client_requests').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('files');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
  const paths = ((data[0]!.files ?? []) as StoredFile[]).map((f) => f.path);
  if (paths.length) await createSupabaseAdminClient().storage.from(BUCKET).remove(paths);
}

/** Link temporário (10 min) para descarregar um ficheiro que o cliente enviou. */
export async function clientRequestFileUrl(ctx: ApiContext, id: string, index: number): Promise<string> {
  const row = unwrap(await ctx.supabase.from('client_requests').select('files').eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(), NOT_FOUND) as { files: StoredFile[] };
  const file = row.files?.[index];
  if (!file) throw new ApiError(404, 'Ficheiro não encontrado');
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(file.path, 600, { download: file.name });
  if (error || !data) throw new ApiError(502, 'Não foi possível abrir o ficheiro');
  return data.signedUrl;
}

// -----------------------------------------------------------------------------
// Página do cliente (sem sessão)
// -----------------------------------------------------------------------------
async function projectByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin.from('lead_projects').select('lead_id, workspace_id').eq('share_token', token).maybeSingle();
  if (!project) return null;
  const ws = project.workspace_id as string;
  const leadId = project.lead_id as string;
  const [{ data: workspace }, { data: lead }] = await Promise.all([
    admin.from('workspaces').select('settings').eq('id', ws).maybeSingle(),
    admin.from('leads').select('id, number, company_name, assigned_to, created_by, archived_at, anonymized_at, project_completed_at').eq('workspace_id', ws).eq('id', leadId).maybeSingle(),
  ]);
  if (!workspace || !lead || lead.anonymized_at || lead.archived_at) return null;
  const features = WorkspaceSettingsSchema.parse(workspace.settings ?? {}).features;
  if (!features.projects || !features.client_page) return null;
  return { ws, leadId, lead: lead as { id: string; number: number; company_name: string; assigned_to: string | null; created_by: string | null; project_completed_at: string | null } };
}

export async function sharedClientRequests(token: string): Promise<SharedClientRequest[]> {
  const project = await projectByToken(token);
  if (!project) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from('client_requests')
    .select('id, title, note, status, client_note, files, sent_at')
    .eq('workspace_id', project.ws)
    .eq('lead_id', project.leadId)
    .order('position')
    .order('created_at');
  if (error) return [];
  return ((data ?? []) as (Omit<SharedClientRequest, 'files'> & { files: StoredFile[] })[]).map((r) => ({ ...r, files: (r.files ?? []).map((f) => ({ name: f.name })) }));
}

const safeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'ficheiro';

/** O cliente envia: uma nota e/ou ficheiros. O pedido passa a "Enviado" e quem trabalha no projeto recebe um aviso. */
export async function clientSendRequest(token: string, id: string, form: FormData): Promise<SharedClientRequest> {
  const project = await projectByToken(token);
  if (!project) throw new ApiError(404, 'Projeto não encontrado');
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from('client_requests').select('id, title, files, status').eq('workspace_id', project.ws).eq('lead_id', project.leadId).eq('id', id).maybeSingle();
  if (!row) throw new ApiError(404, NOT_FOUND);
  const note = String(form.get('note') ?? '').trim().slice(0, 2000) || null;
  const uploads = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!note && !uploads.length) throw new ApiError(422, 'Nada para enviar', 'Escreva uma nota ou junte pelo menos um ficheiro.');
  const current = (row.files ?? []) as StoredFile[];
  if (current.length + uploads.length > CLIENT_REQUEST_MAX_FILES) throw new ApiError(422, 'Demasiados ficheiros', `No máximo ${CLIENT_REQUEST_MAX_FILES} ficheiros por pedido.`);
  const big = uploads.find((f) => f.size > CLIENT_REQUEST_MAX_FILE_BYTES);
  if (big) throw new ApiError(422, 'Ficheiro demasiado grande', `"${big.name}" tem mais de 25 MB. Envie-o por outro meio (ex.: WeTransfer) e deixe o link na nota.`);
  const added: StoredFile[] = [];
  for (const file of uploads) {
    const path = `${project.ws}/requests/${project.leadId}/${randomUUID()}-${safeName(file.name)}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw new ApiError(502, 'Falha no envio', `Não foi possível guardar "${file.name}". Tente outra vez.`);
    added.push({ name: file.name.slice(0, 200), path, size: file.size, type: file.type || 'application/octet-stream' });
  }
  const { data: saved, error } = await admin
    .from('client_requests')
    .update({ status: row.status === 'done' ? 'done' : 'sent', sent_at: new Date().toISOString(), client_note: note, files: [...current, ...added] })
    .eq('id', id)
    .select('id, title, note, status, client_note, files, sent_at')
    .single();
  if (error) throw fromPostgrest(error);

  const userId = project.lead.assigned_to ?? project.lead.created_by;
  const ctx = await systemContext(project.ws, userId);
  if (ctx) {
    const what = [added.length ? `${added.length} ficheiro${added.length === 1 ? '' : 's'}` : null, note ? `“${note.slice(0, 200)}”` : null].filter(Boolean).join(' · ');
    await createActivity(ctx, project.leadId, { type: 'note', body: `📎 O cliente enviou: ${row.title as string}${what ? ` — ${what}` : ''}`, payload: { via: 'client_request', request_id: id } }).catch(() => undefined);
    await alertUser(project.ws, ctx.user.id, {
      kind: 'client',
      leadId: project.leadId,
      title: `📎 ${project.lead.company_name} enviou: ${row.title as string}`,
      body: what || 'Marcou como enviado.',
      url: `${leadPath(project.lead)}#projeto`,
      tag: `client-request-${id}`,
    }).catch(() => undefined);
  }
  const s = saved as Omit<SharedClientRequest, 'files'> & { files: StoredFile[] };
  return { ...s, files: s.files.map((f) => ({ name: f.name })) };
}
