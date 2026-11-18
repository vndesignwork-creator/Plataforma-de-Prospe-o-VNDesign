import { ApiError } from '@/server/http';
import { sharedBrandKitZip } from '@/server/services/brand-kit';

export const runtime = 'nodejs';

/* GET /api/v1/public/projects/{código}/kit — o kit da marca em ZIP, na página do cliente (sem sessão). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const zip = await sharedBrandKitZip((await params).token);
    if (!zip) return new Response('Esta página não existe ou foi desligada.', { status: 404 });
    return new Response(new Uint8Array(zip.content), {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${zip.filename}"`, 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    const message = e instanceof ApiError ? (e.detail ?? e.title) : 'Não foi possível preparar o ficheiro. Tente mais tarde.';
    return new Response(message, { status: e instanceof ApiError ? e.status : 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
