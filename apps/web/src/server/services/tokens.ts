/**
 * Gestão dos tokens de integração (só com a sessão da web ou da app — um
 * token não pode criar outros tokens).
 */
import { addDays, todayIso, type ApiToken, type ApiTokenCreated } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { generateApiToken } from '../tokens';

const TOKEN_SELECT = 'id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at';
const MAX_ACTIVE_TOKENS = 20;

export async function listTokens(ctx: ApiContext): Promise<ApiToken[]> {
  const { data, error } = await ctx.supabase
    .from('api_tokens')
    .select(TOKEN_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false });
  if (error) throw fromPostgrest(error);
  return (data ?? []) as ApiToken[];
}

export async function createToken(
  ctx: ApiContext,
  input: { name: string; scopes: ApiToken['scopes']; expires_in_days: number | null },
): Promise<ApiTokenCreated> {
  const active = (await listTokens(ctx)).filter((t) => !t.revoked_at);
  if (active.length >= MAX_ACTIVE_TOKENS) {
    throw new ApiError(422, 'Demasiados tokens', `Máximo de ${MAX_ACTIVE_TOKENS} tokens ativos. Revoga os que já não usas.`);
  }
  const { token, prefix, hash } = generateApiToken();
  const expiresAt = input.expires_in_days ? `${addDays(todayIso(), input.expires_in_days)}T23:59:59Z` : null;
  const result = await ctx.supabase
    .from('api_tokens')
    .insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.user.id,
      name: input.name,
      prefix,
      token_hash: hash,
      scopes: [...new Set(input.scopes)],
      expires_at: expiresAt,
    })
    .select(TOKEN_SELECT)
    .single();
  return { ...(unwrap(result) as ApiToken), token };
}

export async function revokeToken(ctx: ApiContext, id: string): Promise<void> {
  const result = await ctx.supabase
    .from('api_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .eq('id', id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (result.error) throw fromPostgrest(result.error);
  if (!result.data) throw new ApiError(404, 'Token não encontrado', 'O token não existe ou já foi revogado.');
}
