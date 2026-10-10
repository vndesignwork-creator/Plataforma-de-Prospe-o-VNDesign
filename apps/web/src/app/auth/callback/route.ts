import { NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { safeNextPath } from '@/lib/utils';
import { createSupabaseServerClient } from '@/server/supabase';

/** Destino dos links enviados por email (recuperar palavra-passe). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const safeNext = safeNextPath(url.searchParams.get('next'));
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(publicUrl(safeNext, request));
  }
  return NextResponse.redirect(publicUrl('/login?erro=link', request));
}
