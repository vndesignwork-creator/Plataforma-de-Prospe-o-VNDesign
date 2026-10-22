/**
 * Briefing online: um formulário por projeto (link /b/<código>) com as
 * perguntas das Definições. O cliente responde e junta ficheiros (logótipo,
 * fotos, textos); ficam no projeto, a fase passa de "Briefing" a "Em
 * produção" e quem criou o lead recebe uma notificação.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  BRIEFING_MAX_FILE_BYTES,
  BRIEFING_MAX_FILES,
  WorkspaceSettingsSchema,
  type BriefingFile,
  type ProjectBriefing,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead } from './leads';
import { sendUserPush } from './push';
import { getSettings } from './workspace';

const SELECT = 'id, lead_id, token, questions, answers, files, status, submitted_at, created_at';
const BUCKET = 'project-files';

export async function getBriefing(ctx: ApiContext, leadId: string): Promise<ProjectBriefing | null> {
  const { data, error } = await ctx.supabase.from('project_briefings').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId).maybeSingle();
  if (error) throw fromPostgrest(error);
  return (data as ProjectBriefing | null) ?? null;
}

/** Cria o briefing (perguntas das Definições) ou volta a pedi-lo (fica "pendente", com as respostas anteriores). */
export async function requestBriefing(ctx: ApiContext, leadId: string): Promise<ProjectBriefing> {
  await getLead(ctx, leadId);
  const existing = await getBriefing(ctx, leadId);
  if (existing) {
    const { data, error } = await ctx.supabase.from('project_briefings').update({ status: 'pendente' }).eq('id', existing.id).select(SELECT).single();
    if (error) throw fromPostgrest(error);
    return data as ProjectBriefing;
  }
  const settings = await getSettings(ctx);
  const { data, error } = await ctx.supabase
    .from('project_briefings')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      token: randomBytes(18).toString('base64url'),
      questions: settings.briefing.questions,
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return data as ProjectBriefing;
}

/** Apaga o briefing (o link deixa de funcionar) e os ficheiros enviados. */
export async function deleteBriefing(ctx: ApiContext, leadId: string): Promise<void> {
  const briefing = await getBriefing(ctx, leadId);
  if (!briefing) throw new ApiError(404, 'Briefing não encontrado');
  if (briefing.files.length) await createSupabaseAdminClient().storage.from(BUCKET).remove(briefing.files.map((f) => f.path));
  const { error } = await ctx.supabase.from('project_briefings').delete().eq('id', briefing.id);
  if (error) throw fromPostgrest(error);
}

/** Link temporário (10 minutos) para descarregar um ficheiro do briefing. */
export async function briefingFileUrl(ctx: ApiContext, leadId: string, index: number): Promise<string> {
  const briefing = await getBriefing(ctx, leadId);
  const file = briefing?.files[index];
  if (!file) throw new ApiError(404, 'Ficheiro não encontrado');
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(file.path, 600, { download: file.name });
  if (error || !data) throw new ApiError(502, 'Ficheiro indisponível', 'Não foi possível abrir o ficheiro. Tenta outra vez.');
  return data.signedUrl;
}

// -----------------------------------------------------------------------------
// Formulário do cliente (sem sessão)
// -----------------------------------------------------------------------------

export interface PublicBriefing {
  company_name: string;
  contact_name: string | null;
  questions: string[];
  answers: string[];
  files: { name: string; size: number }[];
  status: ProjectBriefing['status'];
  submitted_at: string | null;
  brand: string;
}

async function loadPublic(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from('project_briefings').select(`${SELECT}, workspace_id, created_by`).eq('token', token).maybeSingle();
  if (!data) return null;
  const [{ data: ws }, { data: lead }] = await Promise.all([
    admin.from('workspaces').select('settings').eq('id', data.workspace_id).maybeSingle(),
    admin.from('leads').select('company_name, contact_name, created_by, anonymized_at, archived_at').eq('id', data.lead_id).maybeSingle(),
  ]);
  const features = WorkspaceSettingsSchema.parse(ws?.settings ?? {}).features;
  if (!lead || lead.anonymized_at || lead.archived_at || !features.projects || !features.briefing) return null;
  return { briefing: data as ProjectBriefing & { workspace_id: string; created_by: string | null }, lead };
}

export async function getPublicBriefing(token: string): Promise<PublicBriefing | null> {
  const found = await loadPublic(token);
  if (!found) return null;
  const { briefing, lead } = found;
  const admin = createSupabaseAdminClient();
  const { data: sigs } = await admin
    .from('signatures')
    .select('full_name, company, user_id, is_default')
    .eq('workspace_id', briefing.workspace_id)
    .order('is_default', { ascending: false });
  const list = (sigs ?? []) as { full_name: string; company: string | null; user_id: string }[];
  const sig = list.find((s) => s.user_id === lead.created_by) ?? list[0];
  return {
    company_name: lead.company_name as string,
    contact_name: (lead.contact_name as string | null) ?? null,
    questions: briefing.questions,
    answers: briefing.answers,
    files: briefing.files.map((f) => ({ name: f.name, size: f.size })),
    status: briefing.status,
    submitted_at: briefing.submitted_at,
    brand: sig?.company || sig?.full_name || 'VNDesign',
  };
}

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80) || 'ficheiro';

/** O cliente envia o briefing (respostas + ficheiros). Pode voltar a enviar enquanto o link existir. */
export async function submitBriefing(token: string, form: FormData): Promise<{ files: number }> {
  const found = await loadPublic(token);
  if (!found) throw new ApiError(404, 'Briefing não encontrado');
  const { briefing, lead } = found;
  const answers = briefing.questions.map((_, i) => String(form.get(`answer_${i}`) ?? '').trim().slice(0, 5000));
  if (!answers.some(Boolean)) throw new ApiError(422, 'Briefing vazio', 'Responde pelo menos a uma pergunta.');
  const uploads = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (briefing.files.length + uploads.length > BRIEFING_MAX_FILES) {
    throw new ApiError(422, 'Demasiados ficheiros', `Pode enviar até ${BRIEFING_MAX_FILES} ficheiros.`);
  }
  const big = uploads.find((f) => f.size > BRIEFING_MAX_FILE_BYTES);
  if (big) throw new ApiError(422, 'Ficheiro demasiado grande', `"${big.name}" tem mais de 15 MB.`);

  const admin = createSupabaseAdminClient();
  const added: BriefingFile[] = [];
  for (const file of uploads) {
    const path = `${briefing.workspace_id}/${briefing.lead_id}/${randomUUID()}-${safeName(file.name)}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) throw new ApiError(502, 'Falha no envio', `Não foi possível guardar "${file.name}". Tenta outra vez.`);
    added.push({ name: file.name.slice(0, 200), path, size: file.size, type: file.type || 'application/octet-stream' });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('project_briefings')
    .update({ answers, files: [...briefing.files, ...added], status: 'respondido', submitted_at: now })
    .eq('id', briefing.id);
  if (error) throw fromPostgrest(error);

  // A fase avança de "Briefing" para "Em produção" (se ainda estava no início).
  await admin
    .from('lead_projects')
    .upsert({ lead_id: briefing.lead_id, workspace_id: briefing.workspace_id }, { onConflict: 'lead_id', ignoreDuplicates: true });
  await admin.from('lead_projects').update({ stage: 'producao' }).eq('lead_id', briefing.lead_id).eq('stage', 'briefing');
  await admin.from('lead_activities').insert({
    workspace_id: briefing.workspace_id,
    lead_id: briefing.lead_id,
    type: 'briefing_received',
    payload: { answers: answers.filter(Boolean).length, files: added.length },
  });
  const notify = (lead.created_by as string | null) ?? briefing.created_by;
  if (notify) {
    await sendUserPush(briefing.workspace_id, notify, {
      title: `📝 Briefing recebido · ${lead.company_name}`,
      body: `${answers.filter(Boolean).length} resposta(s)${added.length ? ` e ${added.length} ficheiro(s)` : ''}.`,
      url: `/leads/${briefing.lead_id}#projeto`,
      tag: `briefing-${briefing.id}`,
    }).catch(() => undefined);
  }
  return { files: added.length };
}
