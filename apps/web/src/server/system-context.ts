/**
 * Contexto para o trabalho do cron (sem pedido nem sessão), em nome de um
 * utilizador do workspace: cliente com a chave de serviço (filtra sempre por
 * workspace_id) e o autor das alterações nos cabeçalhos para os triggers.
 */
import type { ApiContext, MemberRole } from './context';
import { createSupabaseAdminClient } from './supabase-admin';

/** Em nome de `userId` (ou, se já não for membro, do dono do workspace). */
export async function systemContext(workspaceId: string, userId: string | null): Promise<ApiContext | null> {
  const admin = createSupabaseAdminClient();
  const { data: members } = await admin
    .from('workspace_members')
    .select('user_id, role, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  const list = (members ?? []) as { user_id: string; role: MemberRole }[];
  // Se quem a criou já não é membro, fica em nome do dono do workspace.
  const member = list.find((m) => m.user_id === userId) ?? list.find((m) => m.role === 'owner') ?? list[0];
  if (!member) return null;
  const { data } = await admin.auth.admin.getUserById(member.user_id);
  return {
    // O autor das alterações (leads criados, atividade) chega aos triggers por este cabeçalho.
    supabase: createSupabaseAdminClient({ 'x-vnd-actor-user': member.user_id }),
    user: { id: member.user_id, email: data.user?.email ?? null },
    workspaceId,
    role: member.role,
    authMethod: 'system',
  };
}
