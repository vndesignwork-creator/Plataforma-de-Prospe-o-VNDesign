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
import { ApiError } from './http';
import { createSupabaseBearerClient, createSupabaseServerClient } from './supabase';
import { createSupabaseAdminClient } from './supabase-admin';
import { hashApiToken, looksLikeApiToken } from './tokens';

export type MemberRole = 'owner' | 'admin' | 'member';

export interface ApiContext {
  supabase: SupabaseClient;
  user: { id: string; email: string | null };
  workspaceId: string;
  role: MemberRole;
  authMethod: 'session' | 'bearer' | 'token';
  /** Só em pedidos com token de integração. */
  token?: { id: string; scopes: ApiTokenScope[] };
}

const UNAUTHORIZED = () =>
  new ApiError(401, 'Não autenticado', 'Inicia sessão ou envia um token Bearer válido.');

export async function getApiContext(req: Request): Promise<ApiContext> {
  const authorization = req.headers.get('authorization');
  let supabase: SupabaseClient;
  let authMethod: ApiContext['authMethod'];
  let user: { id: string; email?: string | null } | null;

  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token.startsWith('vnd_')) return getTokenContext(req, token);
    supabase = createSupabaseBearerClient(token);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw UNAUTHORIZED();
    user = data.user;
    authMethod = 'bearer';
  } else {
    assertSameOrigin(req);
    supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
    authMethod = 'session';
  }
  if (!user) throw UNAUTHORIZED();

  // Workspace: o indicado em X-Workspace-Id ou o primeiro de que o utilizador é membro.
  const requested = req.headers.get('x-workspace-id');
  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw new ApiError(500, 'Erro interno', 'Não foi possível carregar o workspace.');
  const membership = requested
    ? memberships?.find((m) => m.workspace_id === requested)
    : memberships?.[0];
  if (!membership) {
    throw new ApiError(403, 'Sem workspace', 'Este utilizador não pertence a nenhum workspace.');
  }

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    workspaceId: membership.workspace_id as string,
    role: membership.role as MemberRole,
    authMethod,
  };
}

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
function assertSameOrigin(req: Request) {
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
