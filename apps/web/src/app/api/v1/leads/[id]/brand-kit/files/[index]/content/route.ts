import { ApiError, apiRoute, parseId } from '@/server/http';
import { brandFileContent } from '@/server/services/brand-kit';

export const runtime = 'nodejs';

/** GET /api/v1/leads/{id}/brand-kit/files/{n}/content — o ficheiro em si (no endereço da plataforma: para ler as cores do logótipo ou pô-lo num código QR). */
export const GET = apiRoute<{ id: string; index: string }>(async (_req, ctx, { id, index }) => {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) throw new ApiError(404, 'Ficheiro não encontrado');
  const file = await brandFileContent(ctx, parseId(id), n);
  return new Response(new Uint8Array(file.data), {
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  });
});
