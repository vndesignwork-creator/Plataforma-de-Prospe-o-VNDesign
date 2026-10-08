import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/** Cliente com a sessão do utilizador (cookies) — RLS aplica-se. */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado a partir de um Server Component: o proxy.ts trata da renovação.
        }
      },
    },
  });
}

/** Cliente com um access token Supabase (app móvel) — RLS aplica-se. */
export function createSupabaseBearerClient(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
