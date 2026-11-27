import { NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { createSupabaseServerClient } from '@/server/supabase';

/** POST /auth/signout — termina a sessão neste aparelho (as outras ficam; para as fechar: Definições → Conta). */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  return NextResponse.redirect(publicUrl('/login', request), { status: 303 });
}
