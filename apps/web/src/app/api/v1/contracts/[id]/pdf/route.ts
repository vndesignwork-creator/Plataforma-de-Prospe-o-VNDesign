import { apiRoute, parseId } from '@/server/http';
import { contractPdf } from '@/server/services/contracts';

export const runtime = 'nodejs';

/** GET /api/v1/contracts/{id}/pdf — o contrato em PDF (?download=1 para descarregar). */
export const GET = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { content, filename } = await contractPdf(ctx, parseId(id, 'Contrato'));
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
