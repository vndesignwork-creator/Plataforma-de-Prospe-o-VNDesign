import { createSupabaseAdminClient } from '@/server/supabase-admin';
import { recordClick, recordOpen } from '@/server/services/email-tracking';

/** Imagem transparente de 1×1 (GIF). */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * Quem tem sessão iniciada na plataforma neste browser (só leitura: lê o token
 * do cookie e confirma-o, sem renovar a sessão nem mexer nos cookies).
 */
async function signedInUser(req: Request): Promise<string | null> {
  const parts = new Map<number, string>();
  for (const pair of (req.headers.get('cookie') ?? '').split(/;\s*/)) {
    const m = /^sb-[^=]+-auth-token(?:\.(\d+))?=(.*)$/.exec(pair);
    if (m) parts.set(Number(m[1] ?? 0), decodeURIComponent(m[2]!));
  }
  if (!parts.size) return null;
  try {
    let raw = [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).join('');
    if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8');
    const token = (JSON.parse(raw) as { access_token?: string }).access_token;
    if (!token) return null;
    const { data } = await createSupabaseAdminClient().auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/public/t/{código}/o.gif — imagem de 1×1 do email (conta uma abertura).
 * GET /api/v1/public/t/{código}/{n} — link n.º n do email (conta o clique e segue para o endereço).
 * Sem sessão. Uma falha a registar nunca impede a imagem nem o link. Se quem
 * abre tem sessão iniciada na plataforma (é da equipa), não conta.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; n: string }> }) {
  const { token, n } = await params;
  const ua = req.headers.get('user-agent');
  const viewerId = await signedInUser(req);
  if (n === 'o.gif') {
    await recordOpen(token, ua, new Date(), viewerId).catch(() => undefined);
    return new Response(PIXEL, {
      headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, no-cache, must-revalidate, private', 'content-length': String(PIXEL.length) },
    });
  }
  const index = Number(n);
  const url = Number.isInteger(index) && index >= 0 && index < 500 ? await recordClick(token, index, ua, new Date(), viewerId).catch(() => null) : null;
  if (!url) return new Response('Link não encontrado.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return Response.redirect(url, 302);
}
