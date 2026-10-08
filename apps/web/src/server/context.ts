/**
 * Contexto de autenticação da API — um único sítio para os três tipos de cliente:
 *  - Web: sessão Supabase em cookies;
 *  - App móvel: "Authorization: Bearer <access token Supabase>";
 *  - Integrações: "Authorization: Bearer vnd_…" (tokens pessoais — Fase D).
 * Em todos os casos o cliente Supabase devolvido aplica o RLS do utilizador.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './http';
import { createSupabaseBearerClient, createSupabaseServerClient } from './supabase';

export type MemberRole = 'owner' | 'admin' | 'member';

export interface ApiContext {
  supabase: SupabaseClient;
  user: { id: string; email: string | null };
  workspaceId: string;
  role: MemberRole;
  authMethod: 'session' | 'bearer';
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
    if (token.startsWith('vnd_')) {
      // Os tokens de integração (POST /leads/import) chegam na Fase D.
      throw new ApiError(401, 'Token não suportado', 'Os tokens de integração ainda não estão ativos.');
    }
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
