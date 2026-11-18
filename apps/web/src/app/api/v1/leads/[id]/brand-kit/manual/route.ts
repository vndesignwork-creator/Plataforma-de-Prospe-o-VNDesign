import { apiRoute, parseId } from '@/server/http';
import { brandManual } from '@/server/services/brand-kit';

export const runtime = 'nodejs';

/** GET /api/v1/leads/{id}/brand-kit/manual — manual de marca em PDF, gerado a partir do kit (?download=1 para descarregar). */
export const GET = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { content, filename } = await brandManual(ctx, parseId(id));
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
