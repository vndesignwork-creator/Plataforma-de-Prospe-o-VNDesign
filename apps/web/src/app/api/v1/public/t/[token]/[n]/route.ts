import { recordClick, recordOpen } from '@/server/services/email-tracking';

/** Imagem transparente de 1×1 (GIF). */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * GET /api/v1/public/t/{código}/o.gif — imagem de 1×1 do email (conta uma abertura).
 * GET /api/v1/public/t/{código}/{n} — link n.º n do email (conta o clique e segue para o endereço).
 * Sem sessão. Uma falha a registar nunca impede a imagem nem o link.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; n: string }> }) {
  const { token, n } = await params;
  const ua = req.headers.get('user-agent');
  if (n === 'o.gif') {
    await recordOpen(token, ua).catch(() => undefined);
    return new Response(PIXEL, {
      headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, no-cache, must-revalidate, private', 'content-length': String(PIXEL.length) },
    });
  }
  const index = Number(n);
  const url = Number.isInteger(index) && index >= 0 && index < 500 ? await recordClick(token, index, ua).catch(() => null) : null;
  if (!url) return new Response('Link não encontrado.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return Response.redirect(url, 302);
}
