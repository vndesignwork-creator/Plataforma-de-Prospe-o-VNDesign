/**
 * GET /api/version — a versão publicada (público, sem dados). A plataforma compara-a
 * com a que tem aberta para avisar de uma versão nova ou de uma atualização em curso.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
