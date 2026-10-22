/** Sessões abertas do próprio utilizador (Definições → Conta) e terminar uma delas. */
import { describeUserAgent, type UserSession } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';

type Row = { id: string; created_at: string; last_active_at: string | null; user_agent: string | null; ip: string | null; aal: string | null; current: boolean };

export async function listMySessions(ctx: ApiContext): Promise<UserSession[]> {
  if (ctx.authMethod !== 'session' && ctx.authMethod !== 'bearer') throw new ApiError(403, 'Só com sessão', 'As sessões só se veem com a conta aberta.');
  const { data, error } = await ctx.supabase.rpc('my_sessions');
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    last_active_at: r.last_active_at,
    device: describeUserAgent(r.user_agent),
    ip: r.ip,
    verified: r.aal === 'aal2',
    current: r.current,
  }));
}

export async function endMySession(ctx: ApiContext, sessionId: string): Promise<void> {
  if (ctx.authMethod !== 'session' && ctx.authMethod !== 'bearer') throw new ApiError(403, 'Só com sessão', 'As sessões só se terminam com a conta aberta.');
  const { data, error } = await ctx.supabase.rpc('end_my_session', { p_session_id: sessionId });
  if (error) throw fromPostgrest(error);
  if (!data) throw new ApiError(404, 'Sessão não encontrada');
}
