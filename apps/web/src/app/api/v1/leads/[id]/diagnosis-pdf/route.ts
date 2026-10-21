import { apiRoute, parseId } from '@/server/http';
import { diagnosisPdf } from '@/server/services/diagnosis';

export const runtime = 'nodejs';

/** GET /api/v1/leads/{id}/diagnosis-pdf — relatório de diagnóstico do site (?download=1 para descarregar). */
export const GET = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { content, filename } = await diagnosisPdf(ctx, parseId(id));
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
