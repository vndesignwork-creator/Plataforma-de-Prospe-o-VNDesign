/**
 * Contexto de autenticação da API — um único sítio para os três tipos de cliente:
 *  - Web: sessão Supabase em cookies;
 *  - App móvel: "Authorization: Bearer <access token Supabase>";
 *  - Integrações: "Authorization: Bearer vnd_…" (tokens pessoais).
 * Na web e na app o cliente Supabase devolvido aplica o RLS do utilizador. Com
 * tokens de integração usa a chave de serviço: os serviços filtram sempre por
 * `workspaceId` e só as rotas que o declaram (apiRoute({ token })) os aceitam.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiTokenScope } from '@vndesign/core';
import { MFA_REQUIRED, needsMfaCode } from '@/lib/mfa';
import { ApiError } from './http';
import { createSupabaseBearerClient, createSupabaseServerClient } from './supabase';
import { createSupabaseAdminClient } from './supabase-admin';
import { hashApiToken, looksLikeApiToken } from './tokens';

export type MemberRole = 'owner' | 'admin' | 'member' | 'prospector';

export interface ApiContext {
  supabase: SupabaseClient;
  user: { id: string; email: string | null };
  workspaceId: string;
  role: MemberRole;
  /** 'system': trabalho do cron em nome de um utilizador (ex.: pesquisas automáticas). */
  authMethod: 'session' | 'bearer' | 'token' | 'system';
  /** Só em pedidos com token de integração. */
  token?: { id: string; scopes: ApiTokenScope[] };
}

const UNAUTHORIZED = () =>
  new ApiError(401, 'Não autenticado', 'Inicia sessão ou envia um token Bearer válido.');

type Membership = { workspace_id: string; role: string; created_at: string };
type Verified = { user: { id: string; email: string | null }; memberships: Membership[] };

/**
 * Verificação da sessão guardada uns segundos, por token: uma página abre 15–35 pedidos
 * à API ao mesmo tempo e cada um confirmava a sessão no Supabase Auth e lia os
 * workspaces (2 idas à rede por pedido). Agora os pedidos com o mesmo token partilham a
 * mesma verificação (também enquanto ainda está a decorrer). A chave é o próprio token:
 * só entra depois de o Supabase o validar, por isso um token inventado nunca a encontra.
 * 30 s: terminar sessão ou sair da equipa demora no máximo isso a valer na API.
 */
const VERIFY_TTL_MS = 30_000;
const VERIFY_MAX = 500;
const verified = new Map<string, { at: number; value: Promise<Verified | null> }>();

function verifyOnce(token: string, verify: () => Promise<Verified | null>): Promise<Verified | null> {
  const now = Date.now();
  const hit = verified.get(token);
  if (hit && now - hit.at < VERIFY_TTL_MS) return hit.value;
  if (verified.size >= VERIFY_MAX) {
    for (const [k, v] of verified) if (now - v.at >= VERIFY_TTL_MS) verified.delete(k);
    if (verified.size >= VERIFY_MAX) verified.clear();
  }
  const value = verify().catch((error: unknown) => {
    verified.delete(token);
    throw error;
  });
  verified.set(token, { at: now, value });
  // Um token recusado (ou ainda sem workspace) não fica guardado.
  void value.then(
    (v) => {
      if (!v || !v.memberships.length) verified.delete(token);
    },
    () => undefined,
  );
  return value;
}

/** Esquece as verificações guardadas (ex.: ao terminar a sessão ou mudar a equipa). */
export function forgetVerifiedSessions(): void {
  verified.clear();
}

export async function getApiContext(req: Request): Promise<ApiContext> {
  const authorization = req.headers.get('authorization');
  let supabase: SupabaseClient;
  let authMethod: ApiContext['authMethod'];
  let accessToken: string | null = null;

  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token.startsWith('vnd_')) return getTokenContext(req, token);
    supabase = createSupabaseBearerClient(token);
    accessToken = token;
    authMethod = 'bearer';
  } else {
    assertSameOrigin(req);
    supabase = await createSupabaseServerClient();
    // Lido dos cookies (sem ida à rede; renova o token se tiver expirado). Só serve de
    // chave: a validação é o getUser abaixo.
    accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
    authMethod = 'session';
  }
  if (!accessToken) throw UNAUTHORIZED();
  const client = supabase;
  const token = accessToken;
  const result = await verifyOnce(token, async () => {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    // Verificação em dois passos ligada: sem o código, a API não responde.
    if (needsMfaCode(data.user, token)) throw MFA_ERROR();
    // Workspaces de que o utilizador é membro (o pedido escolhe com X-Workspace-Id).
    const { data: memberships, error: membershipError } = await client
      .from('workspace_members')
      .select('workspace_id, role, created_at')
      .eq('user_id', data.user.id)
      .order('created_at', { ascending: true });
    if (membershipError) throw new ApiError(500, 'Erro interno', 'Não foi possível carregar o workspace.');
    return { user: { id: data.user.id, email: data.user.email ?? null }, memberships: (memberships ?? []) as Membership[] };
  });
  if (!result) throw UNAUTHORIZED();

  // Workspace: o indicado em X-Workspace-Id ou o primeiro de que o utilizador é membro.
  const requested = req.headers.get('x-workspace-id');
  const membership = requested ? result.memberships.find((m) => m.workspace_id === requested) : result.memberships[0];
  if (!membership) {
    throw new ApiError(403, 'Sem workspace', 'Este utilizador não pertence a nenhum workspace.');
  }

  return {
    supabase,
    user: result.user,
    workspaceId: membership.workspace_id,
    role: membership.role as MemberRole,
    authMethod,
  };
}

const MFA_ERROR = () =>
  new ApiError(401, 'Falta o código de verificação', 'Escreve o código da app de autenticação para continuar.', { code: MFA_REQUIRED });

const INVALID_TOKEN = () =>
  new ApiError(401, 'Token inválido', 'O token não existe, foi revogado ou expirou. Cria um novo nas Definições.');

/** Pedido com token de integração: valida o hash, a validade e a pertença ao workspace. */
async function getTokenContext(req: Request, token: string): Promise<ApiContext> {
  if (!looksLikeApiToken(token)) throw INVALID_TOKEN();
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('api_tokens')
    .select('id, workspace_id, user_id, scopes, expires_at, revoked_at, last_used_at')
    .eq('token_hash', hashApiToken(token))
    .maybeSingle();
  if (error) throw new ApiError(500, 'Erro interno', 'Não foi possível validar o token.');
  if (!row || row.revoked_at || (row.expires_at && new Date(row.expires_at) <= new Date())) throw INVALID_TOKEN();

  const requested = req.headers.get('x-workspace-id');
  if (requested && requested !== row.workspace_id) {
    throw new ApiError(403, 'Workspace errado', 'Este token pertence a outro workspace.');
  }
  const { data: member } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', row.workspace_id)
    .eq('user_id', row.user_id)
    .maybeSingle();
  if (!member) throw INVALID_TOKEN();
  const { data: userData } = await admin.auth.admin.getUserById(row.user_id as string);

  // "Último uso" atualizado no máximo uma vez por minuto (não bloqueia o pedido).
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    void admin.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id).then(() => undefined);
  }

  return {
    // O autor (utilizador + token) chega aos triggers através destes cabeçalhos.
    supabase: createSupabaseAdminClient({ 'x-vnd-actor-user': row.user_id, 'x-vnd-token-id': row.id }),
    user: { id: row.user_id as string, email: userData.user?.email ?? null },
    workspaceId: row.workspace_id as string,
    role: member.role as MemberRole,
    authMethod: 'token',
    token: { id: row.id as string, scopes: row.scopes as ApiTokenScope[] },
  };
}

/**
 * Proteção CSRF para pedidos autenticados por cookie: pedidos que alteram dados
 * têm de vir da própria aplicação (cabeçalho Origin igual ao host).
 */
export function assertSameOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  const origin = req.headers.get('origin');
  if (!origin) return; // pedidos fora do browser (sem cookies de sessão de terceiros)
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch {
    throw new ApiError(403, 'Origem não permitida', 'O pedido não veio desta aplicação.');
  }
}
