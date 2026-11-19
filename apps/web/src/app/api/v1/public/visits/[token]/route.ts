import { recordSiteVisit } from '@/server/services/site-visits';

/**
 * POST /api/v1/public/visits/{código} — o plugin de WordPress avisa que um lead
 * (que clicou num email) está no site. Sem sessão; responde sempre 204, para
 * não dizer a ninguém que códigos existem.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await req.json().catch(() => null)) as { lead?: unknown; page?: unknown; referrer?: unknown } | null;
    if (typeof body?.lead === 'string' && typeof body.page === 'string') {
      await recordSiteVisit(token, {
        lead: body.lead,
        page: body.page,
        referrer: typeof body.referrer === 'string' ? body.referrer : null,
      }).catch(() => false);
    }
  } catch {
    // Nunca estraga a página do site do utilizador.
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
