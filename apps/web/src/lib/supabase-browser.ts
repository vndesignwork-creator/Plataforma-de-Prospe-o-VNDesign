'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authCookieOptions } from '@/lib/env';

let client: SupabaseClient | undefined;

/** Cliente Supabase do browser (só para autenticação; os dados passam pela API). */
export function getSupabaseBrowserClient(): SupabaseClient {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: authCookieOptions },
  );
  return client;
}
