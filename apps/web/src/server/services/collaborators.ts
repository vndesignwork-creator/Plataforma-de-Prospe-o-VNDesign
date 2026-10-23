/**
 * Colaboradores dos projetos.
 *
 * Dono do workspace (sessão normal, RLS): convidar por email, ver o estado do
 * convite e remover.
 *
 * Colaborador: não é membro do workspace, por isso o RLS não lhe dá acesso a
 * nada. Estas funções confirmam primeiro que o convite está ativo para aquele
 * projeto e só depois leem/escrevem com a chave de serviço — sempre filtrado
 * pelo workspace e pelo projeto, e devolvendo só tarefas, entregas, briefing e
 * as horas do próprio (nunca contactos, notas, valores ou pagamentos).
 */
import { randomBytes } from 'node:crypto';
import {
  plainTextToHtml,
  type CollabProject,
  type CollabProjectSummary,
  type CollaboratorPerson,
  type CollaboratorAccept,
  type CollaboratorInvite,
  type LeadTask,
  type ProjectBriefing,
  type ProjectCollaborator,
  type ProjectDeliverableCreate,
  type ProjectStage,
  type TimeEntryCreate,
} from '@vndesign/core';
import { MFA_REQUIRED, needsMfaCode } from '@/lib/mfa';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { isMailConfigured, sendMail, sendWithAccount } from '../mailer';
import { requestOrigin } from '../request-origin';
import { createSupabaseBearerClient, createSupabaseServerClient } from '../supabase';
import { createSupabaseAdminClient } from '../supabase-admin';
import { brandFileUrlFor, listAccessesFor, revealAccess, toBrandKit } from './brand-kit';
import { getBriefing } from './briefing';
import { mainClientId } from './client-projects';
import { loadSmtpAccount } from './mail-account';
import { addTimeEntry, createDeliverable, getProjectTime, startTimer } from './project-tools';
import { sendUserPush } from './push';
import { createTask, listTasks, updateTask } from './tasks';
import { getLead } from './leads';
import { getSettings, getSignature } from './workspace';

const SELECT = 'id, lead_id, email, name, user_id, status, invited_at, accepted_at, token';
type Row = ProjectCollaborator & { workspace_id?: string; created_by?: string | null };

const toCollaborator = (r: Row): ProjectCollaborator => ({
  id: r.id,
  lead_id: r.lead_id,
  email: r.email,
  name: r.name,
  user_id: r.user_id,
  status: r.status,
  invited_at: r.invited_at,
  accepted_at: r.accepted_at,
  token: r.status === 'convidado' ? r.token : null,
});

// -----------------------------------------------------------------------------
// Dono do workspace
// -----------------------------------------------------------------------------

export async function listCollaborators(ctx: ApiContext, leadId: string): Promise<ProjectCollaborator[]> {
  const { data, error } = await ctx.supabase
    .from('project_collaborators')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('invited_at');
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map(toCollaborator);
}

/**
 * Página Colaboradores: todos os convites do workspace, agrupados por pessoa
 * (email), com as horas que cada uma registou em cada projeto.
 */
export async function listAllCollaborators(ctx: ApiContext): Promise<CollaboratorPerson[]> {
  const { data, error } = await ctx.supabase
    .from('project_collaborators')
    .select(`${SELECT}, lead:leads!inner(id, number, company_name, project_title, project_completed_at)`)
    .eq('workspace_id', ctx.workspaceId)
    .order('invited_at');
  if (error) throw fromPostgrest(error);
  type Joined = Row & { lead: { id: string; number: number; company_name: string; project_title: string | null; project_completed_at: string | null } };
  const rows = (data ?? []) as unknown as Joined[];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((u): u is string => !!u))];

  // Horas de cada colaborador, por projeto.
  const minutes = new Map<string, number>(); // `${user}:${lead}`
  const recent = new Map<string, number>(); // user → últimos 30 dias
  const last = new Map<string, string>(); // user → último registo
  if (userIds.length) {
    const { data: entries, error: tError } = await ctx.supabase
      .from('project_time_entries')
      .select('user_id, lead_id, started_at, ended_at')
      .eq('workspace_id', ctx.workspaceId)
      .in('user_id', userIds)
      .not('ended_at', 'is', null);
    if (tError) throw fromPostgrest(tError);
    const since = Date.now() - 30 * 86_400_000;
    for (const e of (entries ?? []) as { user_id: string; lead_id: string; started_at: string; ended_at: string }[]) {
      const m = Math.max(0, (Date.parse(e.ended_at) - Date.parse(e.started_at)) / 60_000);
      const key = `${e.user_id}:${e.lead_id}`;
      minutes.set(key, (minutes.get(key) ?? 0) + m);
      if (Date.parse(e.started_at) >= since) recent.set(e.user_id, (recent.get(e.user_id) ?? 0) + m);
      if (!last.has(e.user_id) || e.ended_at > last.get(e.user_id)!) last.set(e.user_id, e.ended_at);
    }
  }

  const people = new Map<string, CollaboratorPerson & { users: Set<string> }>();
  for (const r of rows) {
    const key = r.email.toLowerCase();
    const person = people.get(key) ?? { email: r.email, name: null, active: false, minutes_total: 0, minutes_30d: 0, last_activity_at: null, projects: [], users: new Set<string>() };
    person.name ??= r.name;
    if (r.status === 'ativo') person.active = true;
    if (r.user_id) person.users.add(r.user_id);
    const projectMinutes = r.user_id ? Math.round(minutes.get(`${r.user_id}:${r.lead_id}`) ?? 0) : 0;
    person.projects.push({
      collaborator_id: r.id,
      lead: { id: r.lead.id, number: r.lead.number, company_name: r.lead.company_name, project_title: r.lead.project_title, completed_at: r.lead.project_completed_at },
      status: r.status,
      invited_at: r.invited_at,
      accepted_at: r.accepted_at,
      token: r.status === 'convidado' ? r.token : null,
      minutes: projectMinutes,
    });
    people.set(key, person);
  }
  return [...people.values()]
    .map(({ users, ...p }) => {
      const ids = [...users];
      const lastAt = ids.map((u) => last.get(u)).filter((v): v is string => !!v).sort().at(-1) ?? null;
      return {
        ...p,
        minutes_total: p.projects.reduce((s, x) => s + x.minutes, 0),
        minutes_30d: Math.round(ids.reduce((s, u) => s + (recent.get(u) ?? 0), 0)),
        last_activity_at: lastAt,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.name ?? a.email).localeCompare(b.name ?? b.email, 'pt'));
}

/** Nomes dos colaboradores de vários projetos (para mostrar quem registou horas). */
export async function collaboratorNames(ctx: ApiContext, leadId: string): Promise<Map<string, string>> {
  const list = await listCollaborators(ctx, leadId);
  return new Map(list.filter((c) => c.user_id).map((c) => [c.user_id!, c.name ?? c.email]));
}

function inviteEmail(input: { name: string | null; company: string; inviter: string; link: string }) {
  const text =
    `${input.name ? `Olá ${input.name},` : 'Olá,'}\n\n` +
    `${input.inviter} convidou-te para colaborares no projeto ${input.company}.\n\n` +
    `Vais ver as tarefas, os ficheiros e o briefing do projeto e podes registar as tuas horas.\n\n` +
    `Aceitar o convite: ${input.link}\n\n` +
    'Até já!';
  return { subject: `Convite para o projeto ${input.company}`, text, html: plainTextToHtml(text) };
}

export async function inviteCollaborator(
  ctx: ApiContext,
  leadId: string,
  input: CollaboratorInvite,
): Promise<{ collaborator: ProjectCollaborator; emailed: boolean }> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível convidar colaboradores para este projeto.');
  if (ctx.user.email && input.email === ctx.user.email.toLowerCase()) {
    throw new ApiError(422, 'É o teu email', 'Convida o email do colaborador, não o teu.');
  }
  const { data, error } = await ctx.supabase
    .from('project_collaborators')
    .insert({ workspace_id: ctx.workspaceId, lead_id: leadId, email: input.email, name: input.name, token: randomBytes(18).toString('base64url') })
    .select(SELECT)
    .single();
  if (error?.code === '23505') throw new ApiError(409, 'Já convidado', 'Este email já foi convidado para este projeto.');
  if (error) throw fromPostgrest(error);
  const collaborator = toCollaborator(data as Row);

  let emailed = false;
  const origin = await requestOrigin();
  if (input.send_email && origin) {
    const signature = await getSignature(ctx);
    const inviter = [signature.full_name, signature.company].filter(Boolean).join(' · ') || 'A VNDesign';
    const message = { to: input.email, ...inviteEmail({ name: input.name, company: lead.company_name, inviter, link: `${origin}/convite/${collaborator.token}` }) };
    try {
      const { account } = await loadSmtpAccount(ctx);
      await sendWithAccount(account, message);
      emailed = true;
    } catch {
      // Sem conta de envio (ou falhou): o servidor, se tiver SMTP; senão fica o link para copiar.
      if (isMailConfigured()) {
        emailed = await sendMail(message).then(
          () => true,
          () => false,
        );
      }
    }
  }
  return { collaborator, emailed };
}

export async function removeCollaborator(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('project_collaborators').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, 'Colaborador não encontrado');
}

// -----------------------------------------------------------------------------
// Convite (sem sessão) e conta do colaborador
// -----------------------------------------------------------------------------

export interface InviteInfo {
  email: string;
  name: string | null;
  company_name: string;
  inviter: string;
  status: ProjectCollaborator['status'];
}

async function loadInvite(token: string): Promise<(Row & { workspace_id: string }) | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await createSupabaseAdminClient()
    .from('project_collaborators')
    .select(`${SELECT}, workspace_id, created_by`)
    .eq('token', token)
    .maybeSingle();
  return (data as (Row & { workspace_id: string }) | null) ?? null;
}

async function ownerName(workspaceId: string, userId: string | null | undefined): Promise<{ name: string; email: string | null }> {
  const admin = createSupabaseAdminClient();
  let query = admin.from('signatures').select('full_name, company, email').eq('workspace_id', workspaceId).limit(1);
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query.maybeSingle();
  const s = data as { full_name: string | null; company: string | null; email: string | null } | null;
  return { name: [s?.full_name, s?.company].filter(Boolean).join(' · ') || 'VNDesign', email: s?.email ?? null };
}

/** Dados para a página do convite (/convite/<código>). */
export async function getInvite(token: string): Promise<InviteInfo | null> {
  const row = await loadInvite(token);
  if (!row) return null;
  const { data: lead } = await createSupabaseAdminClient().from('leads').select('company_name').eq('id', row.lead_id).maybeSingle();
  if (!lead) return null;
  const owner = await ownerName(row.workspace_id, row.created_by);
  return { email: row.email, name: row.name, company_name: (lead as { company_name: string }).company_name, inviter: owner.name, status: row.status };
}

async function activate(row: Row, userId: string, name: string | null) {
  const { error } = await createSupabaseAdminClient()
    .from('project_collaborators')
    .update({ user_id: userId, status: 'ativo', accepted_at: new Date().toISOString(), ...(name ? { name } : {}) })
    .eq('id', row.id);
  if (error) throw fromPostgrest(error);
}

/** Aceitar sem conta: cria a conta do colaborador (sem workspace próprio) com o email do convite. */
export async function acceptInvite(token: string, input: CollaboratorAccept): Promise<{ email: string }> {
  const row = await loadInvite(token);
  if (!row) throw new ApiError(404, 'Convite não encontrado', 'O convite foi removido ou o link está incompleto.');
  if (row.status === 'ativo') throw new ApiError(409, 'Convite já aceite', 'Entra com o teu email e palavra-passe.');
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: row.email,
    password: input.password,
    // O link chegou a este email: fica confirmado.
    email_confirm: true,
    app_metadata: { vnd_collaborator: true },
    user_metadata: { full_name: input.name, vnd_collaborator: true },
  });
  if (error || !data.user) {
    if (error && /already|exists|registered/i.test(error.message)) {
      throw new ApiError(409, 'Já tens conta', 'Já existe uma conta com este email: entra com a tua palavra-passe para aceitar o convite.', {
        code: 'account_exists',
      });
    }
    if (error && /password/i.test(error.message)) throw new ApiError(422, 'Palavra-passe fraca', 'Escolhe uma palavra-passe mais forte (letras e números).');
    throw new ApiError(502, 'Não foi possível criar a conta', 'Tenta outra vez daqui a pouco.');
  }
  await activate(row, data.user.id, input.name);
  await notifyOwner(row, `${input.name} aceitou o convite para o projeto.`);
  return { email: row.email };
}

/** Aceitar com a conta já aberta (o email tem de ser o do convite). */
export async function claimInvite(user: CollabUser, token: string): Promise<void> {
  const row = await loadInvite(token);
  if (!row) throw new ApiError(404, 'Convite não encontrado');
  if ((user.email ?? '').toLowerCase() !== row.email) {
    throw new ApiError(403, 'Outro email', `Este convite é para ${row.email}. Entra com essa conta.`);
  }
  if (row.status === 'ativo' && row.user_id === user.id) return;
  await activate(row, user.id, row.name);
  await notifyOwner(row, `${row.name ?? row.email} aceitou o convite para o projeto.`);
}

async function notifyOwner(row: Row & { workspace_id?: string; created_by?: string | null }, body: string) {
  if (!row.created_by || !row.workspace_id) return;
  const { data: lead } = await createSupabaseAdminClient().from('leads').select('company_name').eq('id', row.lead_id).maybeSingle();
  await sendUserPush(row.workspace_id, row.created_by, {
    title: `👥 ${(lead as { company_name: string } | null)?.company_name ?? 'Projeto'}`,
    body,
    url: `/leads/${row.lead_id}#projeto`,
    tag: `collab-${row.id}`,
  }).catch(() => undefined);
}

// -----------------------------------------------------------------------------
// Portal do colaborador
// -----------------------------------------------------------------------------

export type CollabUser = { id: string; email: string | null };

/** Utilizador da sessão (cookies ou Bearer), sem exigir workspace. */
export async function getCollabUser(req: Request): Promise<CollabUser> {
  const authorization = req.headers.get('authorization');
  let user: { id: string; email?: string | null; factors?: { status: string }[] | null } | null = null;
  let token: string | null = null;
  if (authorization?.toLowerCase().startsWith('bearer ') && !authorization.slice(7).trim().startsWith('vnd_')) {
    token = authorization.slice(7).trim();
    const { data } = await createSupabaseBearerClient(token).auth.getUser(token);
    user = data.user;
  } else {
    const supabase = await createSupabaseServerClient();
    user = (await supabase.auth.getUser()).data.user;
    if (user) token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
  }
  if (!user) throw new ApiError(401, 'Não autenticado', 'Inicia sessão para continuar.');
  if (needsMfaCode(user, token)) throw new ApiError(401, 'Falta o código de verificação', undefined, { code: MFA_REQUIRED });
  return { id: user.id, email: user.email ?? null };
}

type Access = { row: Row & { workspace_id: string; created_by: string | null }; ctx: ApiContext };

/** Convites ativos do utilizador (os projetos com a funcionalidade desligada ficam de fora). */
async function activeRows(user: CollabUser, leadId?: string) {
  let query = createSupabaseAdminClient()
    .from('project_collaborators')
    .select(`${SELECT}, workspace_id, created_by, workspace:workspaces!inner(settings)`)
    .eq('user_id', user.id)
    .eq('status', 'ativo');
  if (leadId) query = query.eq('lead_id', leadId);
  const { data, error } = await query;
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as unknown as (Row & { workspace_id: string; created_by: string | null; workspace: { settings: { features?: { collaborators?: boolean } } } })[]).filter(
    (r) => r.workspace.settings?.features?.collaborators !== false,
  );
}

/** Contexto de serviço só para este projeto (o autor das alterações é o colaborador). */
function collabContext(row: Row & { workspace_id: string }, user: CollabUser): ApiContext {
  return {
    supabase: createSupabaseAdminClient({ 'x-vnd-actor-user': user.id }),
    user,
    workspaceId: row.workspace_id,
    role: 'member',
    authMethod: 'system',
  };
}

async function access(user: CollabUser, leadId: string): Promise<Access> {
  const [row] = await activeRows(user, leadId);
  if (!row) throw new ApiError(404, 'Projeto não encontrado', 'Este projeto não existe ou o teu acesso foi removido.');
  return { row, ctx: collabContext(row, user) };
}

export async function isCollaborator(userId: string): Promise<boolean> {
  const { count } = await createSupabaseAdminClient()
    .from('project_collaborators')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'ativo');
  return (count ?? 0) > 0;
}

type LeadInfo = { id: string; company_name: string; website: string | null; archived_at: string | null; anonymized_at: string | null };
type ProjectRow = { lead_id: string; stage: ProjectStage; due_on: string | null };

export async function listCollabProjects(user: CollabUser): Promise<CollabProjectSummary[]> {
  const rows = await activeRows(user);
  if (!rows.length) return [];
  const admin = createSupabaseAdminClient();
  const ids = rows.map((r) => r.lead_id);
  const [leads, projects, tasks] = await Promise.all([
    admin.from('leads').select('id, company_name, website, archived_at, anonymized_at').in('id', ids),
    admin.from('lead_projects').select('lead_id, stage, due_on').in('lead_id', ids),
    admin.from('lead_tasks').select('lead_id, done_at').in('lead_id', ids),
  ]);
  const leadMap = new Map(((leads.data ?? []) as LeadInfo[]).map((l) => [l.id, l]));
  const projectMap = new Map(((projects.data ?? []) as ProjectRow[]).map((p) => [p.lead_id, p]));
  const owners = new Map<string, string>();
  const out: CollabProjectSummary[] = [];
  for (const r of rows) {
    const lead = leadMap.get(r.lead_id);
    if (!lead || lead.anonymized_at) continue;
    const key = `${r.workspace_id}:${r.created_by}`;
    if (!owners.has(key)) owners.set(key, (await ownerName(r.workspace_id, r.created_by)).name);
    const own = ((tasks.data ?? []) as { lead_id: string; done_at: string | null }[]).filter((t) => t.lead_id === r.lead_id);
    out.push({
      lead_id: r.lead_id,
      company_name: lead.company_name,
      stage: projectMap.get(r.lead_id)?.stage ?? 'briefing',
      due_on: projectMap.get(r.lead_id)?.due_on ?? null,
      tasks: { total: own.length, done: own.filter((t) => t.done_at).length },
      owner: owners.get(key)!,
    });
  }
  return out;
}

const briefingFileUrl = (leadId: string, index: number) => `/api/v1/collab/projects/${leadId}/briefing/files/${index}`;

function briefingView(leadId: string, b: ProjectBriefing | null): CollabProject['briefing'] {
  if (!b) return null;
  return {
    status: b.status,
    items: b.questions.map((question, i) => ({ question, answer: b.answers[i] ?? '' })).filter((q) => q.answer.trim()),
    files: b.files.map((f, i) => ({ name: f.name, size: f.size, url: briefingFileUrl(leadId, i) })),
  };
}

export async function getCollabProject(user: CollabUser, leadId: string): Promise<CollabProject> {
  const { row, ctx } = await access(user, leadId);
  const admin = createSupabaseAdminClient();
  const [{ data: lead }, { data: project }, tasks, deliverables, briefing, time, owner, settings] = await Promise.all([
    admin.from('leads').select('id, company_name, website').eq('workspace_id', row.workspace_id).eq('id', leadId).maybeSingle(),
    admin.from('lead_projects').select('stage, due_on').eq('lead_id', leadId).maybeSingle(),
    listTasks(ctx, leadId),
    admin.from('project_deliverables').select('id, title, url, status, created_at').eq('workspace_id', row.workspace_id).eq('lead_id', leadId).order('created_at'),
    getBriefing(ctx, leadId),
    getProjectTime(ctx, leadId),
    ownerName(row.workspace_id, row.created_by),
    getSettings(ctx),
  ]);
  if (!lead) throw new ApiError(404, 'Projeto não encontrado');
  const mine = time.entries.filter((e) => e.user_id === user.id);
  // Kit da marca do cliente (no registo principal) e os acessos marcados para partilhar.
  const mainId = await mainClientId(ctx, leadId);
  const [{ data: kitRow }, accesses] = await Promise.all([
    admin.from('lead_brand_kits').select('colors, fonts, links, files, notes, updated_at').eq('workspace_id', row.workspace_id).eq('lead_id', mainId).maybeSingle(),
    listAccessesFor(ctx, mainId, true),
  ]);
  return {
    lead_id: leadId,
    company_name: (lead as LeadInfo).company_name,
    website: (lead as LeadInfo).website,
    stage: (project as ProjectRow | null)?.stage ?? 'briefing',
    due_on: (project as ProjectRow | null)?.due_on ?? null,
    owner,
    tasks: tasks.map((t: LeadTask) => ({ id: t.id, title: t.title, due_on: t.due_on, done: !!t.done_at })),
    deliverables: (deliverables.data ?? []) as CollabProject['deliverables'],
    briefing: settings.features.briefing ? briefingView(leadId, briefing) : null,
    brand: kitRow ? toBrandKit(mainId, kitRow as Parameters<typeof toBrandKit>[1], (i) => `/api/v1/collab/projects/${leadId}/brand-files/${i}`) : null,
    accesses,
    time: {
      entries: mine,
      total_minutes: Math.floor(mine.reduce((s, e) => s + e.seconds, 0) / 60),
      running: mine.find((e) => !e.ended_at) ?? null,
    },
  };
}

export async function collabAddTask(user: CollabUser, leadId: string, title: string): Promise<void> {
  const { ctx } = await access(user, leadId);
  await createTask(ctx, leadId, { title, due_on: null, remind_at: null });
}

export async function collabSetTask(user: CollabUser, leadId: string, taskId: string, done: boolean): Promise<void> {
  const { row, ctx } = await access(user, leadId);
  const { data } = await ctx.supabase.from('lead_tasks').select('id, title, done_at').eq('workspace_id', row.workspace_id).eq('lead_id', leadId).eq('id', taskId).maybeSingle();
  if (!data) throw new ApiError(404, 'Tarefa não encontrada');
  await updateTask(ctx, taskId, { done });
  if (done && !(data as { done_at: string | null }).done_at) {
    await notifyOwner(row, `${row.name ?? row.email} concluiu: ${(data as { title: string }).title}`);
  }
}

export async function collabAddDeliverable(user: CollabUser, leadId: string, input: ProjectDeliverableCreate): Promise<void> {
  const { row, ctx } = await access(user, leadId);
  // O colaborador junta; quem envia ao cliente é o dono do projeto.
  await createDeliverable(ctx, leadId, { ...input, status: 'rascunho' });
  await notifyOwner(row, `${row.name ?? row.email} juntou uma entrega: ${input.title}`);
}

/** Para o temporizador do colaborador em qualquer projeto (só há um a contar por pessoa). */
async function stopAnyTimer(userId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('project_time_entries')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('ended_at', null);
  if (error) throw fromPostgrest(error);
}

export async function collabTimer(user: CollabUser, leadId: string, action: 'start' | 'stop', notes: string | null): Promise<void> {
  const { ctx } = await access(user, leadId);
  await stopAnyTimer(user.id);
  if (action === 'start') await startTimer(ctx, leadId, notes);
}

export async function collabAddTime(user: CollabUser, leadId: string, input: TimeEntryCreate): Promise<void> {
  const { ctx } = await access(user, leadId);
  await addTimeEntry(ctx, leadId, input);
}

export async function collabBriefingFileUrl(user: CollabUser, leadId: string, index: number): Promise<string> {
  const { ctx } = await access(user, leadId);
  const briefing = await getBriefing(ctx, leadId);
  const file = briefing?.files[index];
  if (!file) throw new ApiError(404, 'Ficheiro não encontrado');
  const { data, error } = await createSupabaseAdminClient().storage.from('project-files').createSignedUrl(file.path, 600, { download: file.name });
  if (error || !data) throw new ApiError(502, 'Ficheiro indisponível', 'Não foi possível abrir o ficheiro. Tenta outra vez.');
  return data.signedUrl;
}

export async function collabBrandFileUrl(user: CollabUser, leadId: string, index: number): Promise<string> {
  const { ctx } = await access(user, leadId);
  return brandFileUrlFor(ctx, await mainClientId(ctx, leadId), index);
}

/** Palavra-passe de um acesso partilhado com os colaboradores deste projeto. */
export async function collabRevealAccess(user: CollabUser, leadId: string, accessId: string): Promise<string | null> {
  const { ctx } = await access(user, leadId);
  return revealAccess(ctx, accessId, { mainId: await mainClientId(ctx, leadId) });
}
