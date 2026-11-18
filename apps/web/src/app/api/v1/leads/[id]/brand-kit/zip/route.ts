import { apiRoute, parseId } from '@/server/http';
import { brandKitZip } from '@/server/services/brand-kit';

export const runtime = 'nodejs';

/** GET /api/v1/leads/{id}/brand-kit/zip — "Descarregar tudo": ficheiros do kit, manual de marca e resumo (cores, letras, links e entregas aprovadas). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  const { content, filename } = await brandKitZip(ctx, parseId(id));
  return new Response(new Uint8Array(content), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' },
  });
});
