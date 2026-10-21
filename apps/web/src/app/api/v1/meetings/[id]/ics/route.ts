import { apiRoute, parseId } from '@/server/http';
import { meetingIcsFile } from '@/server/services/meetings';

/** GET /api/v1/meetings/{id}/ics — a reunião para juntar ao próprio calendário. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  const { content, filename } = await meetingIcsFile(ctx, parseId(id, 'Registo'));
  return new Response(content, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
