/**
 * Equipa de prospeção: convidar (link /equipa/<código>), aceitar (cria a conta
 * sem workspace próprio e junta-a a este com o papel do convite), mudar o
 * papel, remover; limite semanal do gerador; estatísticas por pessoa.
 */
import { randomBytes } from 'node:crypto';
import {
  isAdminRole,
  plainTextToHtml,
  todayIso,
  type InviteRole,
  type MemberRole,
  type Team,
  type TeamAccept,
  type TeamInvite,
  type TeamInviteCreate,
  type TeamInviteInfo,
  type TeamMember,
  type TeamActivity,
  type TeamStats,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { isMailConfigured, sendMail, sendWithAccount } from '../mailer';
import { requestOrigin } from '../request-origin';
import { createSupabaseAdminClient } from '../supabase-admin';
import { loadSmtpAccount } from './mail-account';
import { avatarUrl, teamProfiles } from './profile';
import { sendUserPush } from './push';
import { getSettings, getSignature } from './workspace';

const INVITE_SELECT = 'id, email, name, role, invited_at, token';

function assertAdmin(ctx: ApiContext) {
  if (!isAdminRole(ctx.role)) throw new ApiError(403, 'Sem permissão', 'Só o dono ou um administrador pode gerir a equipa.');
}

export async function getTeam(ctx: ApiContext): Promise<Team> {
  assertAdmin(ctx);
  const admin = createSupabaseAdminClient();
  const [{ data: rows, error }, { data: invites, error: iError }, { data: sigs }, profiles] = await Promise.all([
    admin.from('workspace_members').select('user_id, role, created_at').eq('workspace_id', ctx.workspaceId).order('created_at'),
    ctx.supabase.from('workspace_invites').select(INVITE_SELECT).eq('workspace_id', ctx.workspaceId).is('accepted_at', null).order('invited_at'),
    admin.from('signatures').select('user_id, full_name').eq('workspace_id', ctx.workspaceId),
    teamProfiles(ctx),
  ]);
  if (error) throw fromPostgrest(error);
  if (iError) throw fromPostgrest(iError);
  const names = new Map(((sigs ?? []) as { user_id: string; full_name: string | null }[]).map((s) => [s.user_id, s.full_name]));
  const members: TeamMember[] = [];
  for (const r of (rows ?? []) as { user_id: string; role: MemberRole; created_at: string }[]) {
    const { data } = await admin.auth.admin.getUserById(r.user_id);
    const meta = (data.user?.user_metadata ?? {}) as { full_name?: string };
    members.push({
      user_id: r.user_id,
      email: data.user?.email ?? null,
      name: profiles.get(r.user_id)?.display_name || names.get(r.user_id) || meta.full_name || null,
      avatar_url: avatarUrl(profiles.get(r.user_id)),
      role: r.role,
      joined_at: r.created_at,
      is_me: r.user_id === ctx.user.id,
    });
  }
  return { members, invites: (invites ?? []) as TeamInvite[] };
}

/** Nomes dos membros (para o "Responsável"); qualquer membro pode ver. */
export async function teamNames(ctx: ApiContext): Promise<{ user_id: string; name: string; role: MemberRole; avatar_url: string | null }[]> {
  const admin = createSupabaseAdminClient();
  const [{ data: rows }, { data: sigs }, profiles] = await Promise.all([
    admin.from('workspace_members').select('user_id, role').eq('workspace_id', ctx.workspaceId),
    admin.from('signatures').select('user_id, full_name').eq('workspace_id', ctx.workspaceId),
    teamProfiles(ctx),
  ]);
  // A alcunha (Definições → Conta) primeiro; senão o nome da assinatura.
  const names = new Map(((sigs ?? []) as { user_id: string; full_name: string | null }[]).map((s) => [s.user_id, s.full_name]));
  for (const [id, p] of profiles) if (p.display_name) names.set(id, p.display_name);
  const out: { user_id: string; name: string; role: MemberRole; avatar_url: string | null }[] = [];
  for (const r of (rows ?? []) as { user_id: string; role: MemberRole }[]) {
    let name = names.get(r.user_id) || null;
    if (!name) {
      const { data } = await admin.auth.admin.getUserById(r.user_id);
      name = (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name || data.user?.email?.split('@')[0] || 'Sem nome';
    }
    out.push({ user_id: r.user_id, name, role: r.role, avatar_url: avatarUrl(profiles.get(r.user_id)) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}

const ROLE_TEXT: Record<InviteRole, string> = {
  prospector: 'Vais procurar, gerar, organizar e contactar leads (sem acesso a projetos, valores nem definições).',
  admin: 'Vais ter acesso a toda a plataforma.',
};

function inviteEmail(input: { name: string | null; inviter: string; role: InviteRole; link: string }) {
  const text =
    `${input.name ? `Olá ${input.name},` : 'Olá,'}\n\n` +
    `${input.inviter} convidou-te para a equipa na VNDesign Leads.\n\n` +
    `${ROLE_TEXT[input.role]}\n\n` +
    `Aceitar o convite: ${input.link}\n\n` +
    'Até já!';
  return { subject: 'Convite para a equipa', text, html: plainTextToHtml(text) };
}

export async function inviteTeamMember(ctx: ApiContext, input: TeamInviteCreate): Promise<{ invite: TeamInvite; emailed: boolean }> {
  assertAdmin(ctx);
  if (ctx.user.email && input.email === ctx.user.email.toLowerCase()) throw new ApiError(422, 'É o teu email', 'Convida o email da outra pessoa.');
  const { data, error } = await ctx.supabase
    .from('workspace_invites')
    .insert({ workspace_id: ctx.workspaceId, email: input.email, name: input.name, role: input.role, token: randomBytes(18).toString('base64url'), invited_by: ctx.user.id })
    .select(INVITE_SELECT)
    .single();
  if (error?.code === '23505') throw new ApiError(409, 'Já convidado', 'Já há um convite por aceitar para este email.');
  if (error) throw fromPostgrest(error);
  const invite = data as TeamInvite;

  let emailed = false;
  const origin = await requestOrigin();
  if (input.send_email && origin) {
    const signature = await getSignature(ctx);
    const inviter = [signature.full_name, signature.company].filter(Boolean).join(' · ') || 'A VNDesign';
    const message = { to: input.email, ...inviteEmail({ name: input.name, inviter, role: input.role, link: `${origin}/equipa/${invite.token}` }) };
    try {
      const { account } = await loadSmtpAccount(ctx);
      await sendWithAccount(account, message);
      emailed = true;
    } catch {
      if (isMailConfigured()) emailed = await sendMail(message).then(() => true, () => false);
    }
  }
  return { invite, emailed };
}

export async function revokeTeamInvite(ctx: ApiContext, id: string): Promise<void> {
  assertAdmin(ctx);
  const { data, error } = await ctx.supabase.from('workspace_invites').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).is('accepted_at', null).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, 'Convite não encontrado');
}

async function memberRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
  const { data } = await createSupabaseAdminClient().from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  return (data as { role: MemberRole } | null)?.role ?? null;
}

export async function updateTeamMember(ctx: ApiContext, userId: string, role: InviteRole): Promise<void> {
  assertAdmin(ctx);
  const current = await memberRole(ctx.workspaceId, userId);
  if (!current) throw new ApiError(404, 'Membro não encontrado');
  if (current === 'owner') throw new ApiError(422, 'É o dono', 'O papel do dono não muda.');
  if (userId === ctx.user.id) throw new ApiError(422, 'És tu', 'Não podes mudar o teu próprio papel.');
  const { error } = await createSupabaseAdminClient().from('workspace_members').update({ role }).eq('workspace_id', ctx.workspaceId).eq('user_id', userId);
  if (error) throw fromPostgrest(error);
}

/** Remove da equipa (perde logo o acesso). Os leads dele ficam sem responsável. */
export async function removeTeamMember(ctx: ApiContext, userId: string): Promise<void> {
  assertAdmin(ctx);
  const current = await memberRole(ctx.workspaceId, userId);
  if (!current) throw new ApiError(404, 'Membro não encontrado');
  if (current === 'owner') throw new ApiError(422, 'É o dono', 'O dono não pode ser removido.');
  if (userId === ctx.user.id) throw new ApiError(422, 'És tu', 'Não podes remover-te a ti próprio.');
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('workspace_members').delete().eq('workspace_id', ctx.workspaceId).eq('user_id', userId);
  if (error) throw fromPostgrest(error);
  await admin.from('leads').update({ assigned_to: null }).eq('workspace_id', ctx.workspaceId).eq('assigned_to', userId);
}

// -----------------------------------------------------------------------------
// Convite (sem sessão)
// -----------------------------------------------------------------------------

type InviteRow = TeamInvite & { workspace_id: string; invited_by: string | null; accepted_at: string | null };

async function loadInvite(token: string): Promise<InviteRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await createSupabaseAdminClient()
    .from('workspace_invites')
    .select(`${INVITE_SELECT}, workspace_id, invited_by, accepted_at`)
    .eq('token', token)
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

async function inviterName(row: InviteRow): Promise<string> {
  let q = createSupabaseAdminClient().from('signatures').select('full_name, company').eq('workspace_id', row.workspace_id).limit(1);
  if (row.invited_by) q = q.eq('user_id', row.invited_by);
  const { data } = await q.maybeSingle();
  const s = data as { full_name: string | null; company: string | null } | null;
  return [s?.full_name, s?.company].filter(Boolean).join(' · ') || 'VNDesign';
}

/** Dados para a página do convite (/equipa/<código>). */
export async function getTeamInvite(token: string): Promise<TeamInviteInfo | null> {
  const row = await loadInvite(token);
  if (!row) return null;
  return { email: row.email, name: row.name, role: row.role, inviter: await inviterName(row), accepted: !!row.accepted_at };
}

/** Junta a conta ao workspace, com a assinatura (copiada da do dono, com o nome e o email da pessoa). */
async function join(row: InviteRow, userId: string, name: string, email: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('workspace_members').upsert({ workspace_id: row.workspace_id, user_id: userId, role: row.role }, { onConflict: 'workspace_id,user_id' });
  if (error) throw fromPostgrest(error);
  const { data: owner } = await admin
    .from('signatures')
    .select('company, website, portfolio_url, design_portfolio_url, project_links')
    .eq('workspace_id', row.workspace_id)
    .eq('user_id', row.invited_by ?? '')
    .maybeSingle();
  const signature = {
    full_name: name,
    role_title: row.role === 'prospector' ? 'Gestão de clientes' : null,
    email,
    ...((owner as Record<string, unknown> | null) ?? { company: 'VNDesign' }),
  };
  const { data: existing } = await admin.from('signatures').select('id').eq('workspace_id', row.workspace_id).eq('user_id', userId).limit(1).maybeSingle();
  if (existing) await admin.from('signatures').update(signature).eq('id', (existing as { id: string }).id);
  else await admin.from('signatures').insert({ workspace_id: row.workspace_id, user_id: userId, ...signature });
  await admin.from('workspace_invites').update({ accepted_at: new Date().toISOString(), accepted_by: userId }).eq('id', row.id);
  if (row.invited_by) {
    await sendUserPush(row.workspace_id, row.invited_by, { title: '👥 Equipa', body: `${name} aceitou o convite para a equipa.`, url: '/equipa', tag: `team-${row.id}` }).catch(
      () => undefined,
    );
  }
}

/** Aceitar sem conta: cria a conta (sem workspace próprio) e junta-a à equipa. */
export async function acceptTeamInvite(token: string, input: TeamAccept): Promise<{ email: string }> {
  const row = await loadInvite(token);
  if (!row) throw new ApiError(404, 'Convite não encontrado', 'O convite foi removido ou o link está incompleto.');
  if (row.accepted_at) throw new ApiError(409, 'Convite já aceite', 'Entra com o teu email e palavra-passe.');
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: row.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.name, vnd_team_invite: true },
  });
  if (error || !data.user) {
    if (error && /already|exists|registered/i.test(error.message)) {
      throw new ApiError(409, 'Já tens conta', 'Já existe uma conta com este email: entra com a tua palavra-passe para aceitar o convite.', { code: 'account_exists' });
    }
    if (error && /password/i.test(error.message)) throw new ApiError(422, 'Palavra-passe fraca', 'Escolhe uma palavra-passe mais forte (letras e números).');
    throw new ApiError(502, 'Não foi possível criar a conta', 'Tenta outra vez daqui a pouco.');
  }
  await join(row, data.user.id, input.name, row.email);
  return { email: row.email };
}

/** Aceitar com a conta já aberta (o email tem de ser o do convite e a conta não pode ter outra equipa). */
export async function claimTeamInvite(user: { id: string; email: string | null }, token: string): Promise<void> {
  const row = await loadInvite(token);
  if (!row) throw new ApiError(404, 'Convite não encontrado');
  if ((user.email ?? '').toLowerCase() !== row.email.toLowerCase()) throw new ApiError(403, 'Outro email', `Este convite é para ${row.email}. Entra com essa conta.`);
  const admin = createSupabaseAdminClient();
  const { data: memberships } = await admin.from('workspace_members').select('workspace_id').eq('user_id', user.id);
  const others = ((memberships ?? []) as { workspace_id: string }[]).filter((m) => m.workspace_id !== row.workspace_id);
  if (others.length) throw new ApiError(409, 'Conta com outra equipa', 'Esta conta já tem a sua própria plataforma. Pede um convite para outro email.');
  if (row.accepted_at) return;
  const { data } = await admin.auth.admin.getUserById(user.id);
  const name = (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name || row.name || row.email.split('@')[0]!;
  await join(row, user.id, name, row.email);
}

// -----------------------------------------------------------------------------
// Gerador de leads: limite semanal do prospetor
// -----------------------------------------------------------------------------

/** Quantos leads o prospetor já juntou pelo gerador nos últimos 7 dias e o limite (null = sem limite). */
export async function generationAllowance(ctx: ApiContext): Promise<{ used: number; limit: number | null }> {
  if (ctx.role !== 'prospector') return { used: 0, limit: null };
  const limit = (await getSettings(ctx)).team.generation_weekly_limit;
  const { data, error } = await ctx.supabase
    .from('lead_generation_runs')
    .select('candidates')
    .eq('workspace_id', ctx.workspaceId)
    .eq('created_by', ctx.user.id)
    .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString());
  if (error) throw fromPostgrest(error);
  const used = ((data ?? []) as { candidates: { added_lead_id?: string | null }[] }[]).reduce((s, r) => s + r.candidates.filter((c) => c.added_lead_id).length, 0);
  return { used, limit };
}

export function assertGenerationRoom(allowance: { used: number; limit: number | null }, wanted: number): void {
  if (allowance.limit === null) return;
  const room = allowance.limit - allowance.used;
  if (room <= 0) {
    throw new ApiError(422, 'Limite semanal atingido', `Já juntaste ${allowance.used} leads pelo gerador esta semana (limite: ${allowance.limit}). O limite renova-se ao longo dos próximos dias.`);
  }
  if (wanted > room) throw new ApiError(422, 'Acima do limite semanal', `Só podes juntar mais ${room} lead${room === 1 ? '' : 's'} esta semana (limite: ${allowance.limit}).`);
}

// -----------------------------------------------------------------------------
// Estatísticas → Equipa
// -----------------------------------------------------------------------------

const CONTACT_TYPES = new Set(['email_sent', 'email_mailto', 'call_logged', 'template_used', 'follow_up_done']);

export async function teamStats(ctx: ApiContext, days = 30): Promise<TeamStats> {
  const people = (await teamNames(ctx)).filter((p) => isAdminRole(ctx.role) || p.user_id === ctx.user.id);
  const ids = people.map((p) => p.user_id);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const today = todayIso();
  const admin = createSupabaseAdminClient();
  const [{ data: acts, error }, { data: created }, { data: open }] = await Promise.all([
    admin
      .from('lead_activities')
      .select('actor_user_id, type, payload, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .in('actor_user_id', ids)
      .gte('created_at', since)
      .limit(20_000),
    admin.from('leads').select('created_by').eq('workspace_id', ctx.workspaceId).in('created_by', ids).gte('created_at', since).limit(20_000),
    admin
      .from('leads')
      .select('assigned_to')
      .eq('workspace_id', ctx.workspaceId)
      .in('assigned_to', ids)
      .not('status', 'in', '(cliente,sem_interesse)')
      .is('archived_at', null)
      .limit(20_000),
  ]);
  if (error) throw fromPostgrest(error);
  const count = <T,>(rows: T[] | null, key: (r: T) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  type Act = { actor_user_id: string; type: string; payload: Record<string, unknown> | null; created_at: string };
  const list = (acts ?? []) as Act[];
  const isContact = (a: Act) => CONTACT_TYPES.has(a.type) || a.payload?.via === 'prospecting';
  const to = (a: Act, status: string) => a.type === 'status_changed' && a.payload?.to === status;
  const contacts = count(list.filter(isContact), (a) => a.actor_user_id);
  const contactsToday = count(list.filter((a) => isContact(a) && todayIso(new Date(a.created_at)) === today), (a) => a.actor_user_id);
  const replied = count(list.filter((a) => to(a, 'respondeu')), (a) => a.actor_user_id);
  const meetings = count(list.filter((a) => to(a, 'reuniao')), (a) => a.actor_user_id);
  const won = count(list.filter((a) => to(a, 'cliente')), (a) => a.actor_user_id);
  const generated = count((created ?? []) as { created_by: string }[], (r) => r.created_by);
  const assigned = count((open ?? []) as { assigned_to: string }[], (r) => r.assigned_to);
  const limit = (await getSettings(ctx)).team.generation_weekly_limit;

  const members = [];
  for (const p of people) {
    let used = 0;
    if (p.role === 'prospector') {
      const { data } = await admin
        .from('lead_generation_runs')
        .select('candidates')
        .eq('workspace_id', ctx.workspaceId)
        .eq('created_by', p.user_id)
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString());
      used = ((data ?? []) as { candidates: { added_lead_id?: string | null }[] }[]).reduce((s, r) => s + r.candidates.filter((c) => c.added_lead_id).length, 0);
    }
    members.push({
      user_id: p.user_id,
      name: p.name,
      role: p.role,
      contacts: contacts.get(p.user_id) ?? 0,
      contacts_today: contactsToday.get(p.user_id) ?? 0,
      replied: replied.get(p.user_id) ?? 0,
      meetings: meetings.get(p.user_id) ?? 0,
      won: won.get(p.user_id) ?? 0,
      generated: generated.get(p.user_id) ?? 0,
      assigned_open: assigned.get(p.user_id) ?? 0,
      generation_used: used,
      generation_limit: p.role === 'prospector' ? limit : null,
    });
  }
  members.sort((a, b) => b.contacts - a.contacts);
  return { days, members };
}

// -----------------------------------------------------------------------------
// Equipa → Atividade ("quem fez o quê")
// -----------------------------------------------------------------------------

/** O que cada pessoa fez nos leads nos últimos dias (dono ou administrador). */
export async function teamActivity(ctx: ApiContext, query: { user?: string; days: number }): Promise<TeamActivity[]> {
  assertAdmin(ctx);
  let q = ctx.supabase
    .from('lead_activities')
    .select('id, type, body, payload, created_at, actor_user_id, lead:leads!inner(id, number, company_name)')
    .eq('workspace_id', ctx.workspaceId)
    .not('actor_user_id', 'is', null)
    .gte('created_at', new Date(Date.now() - query.days * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(200);
  if (query.user) q = q.eq('actor_user_id', query.user);
  const [{ data, error }, names] = await Promise.all([q, teamNames(ctx)]);
  if (error) throw fromPostgrest(error);
  const byId = new Map(names.map((n) => [n.user_id, n.name]));
  return ((data ?? []) as unknown as Omit<TeamActivity, 'actor_name'>[]).map((a) => ({
    ...a,
    actor_name: a.actor_user_id ? (byId.get(a.actor_user_id) ?? null) : null,
  }));
}
