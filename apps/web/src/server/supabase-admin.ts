import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Cliente com a chave secreta (ignora o RLS). Só para tarefas do servidor sem
 * utilizador (ex.: resumo diário). Cada consulta TEM de filtrar por workspace_id.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('Falta a variável de ambiente SUPABASE_SECRET_KEY.');
  return createClient(env.supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
