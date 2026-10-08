import { LeadListQuerySchema } from '@vndesign/core';
import { ApiError, apiRoute, parseQuery } from '@/server/http';
import { exportLeads } from '@/server/services/export';
import { listAllLeads } from '@/server/services/leads';

/** GET /api/v1/leads/export?format=csv|xlsx — exporta os leads (aceita os filtros da lista). */
export const GET = apiRoute(async (req, ctx) => {
  const format = new URL(req.url).searchParams.get('format') ?? 'xlsx';
  if (format !== 'csv' && format !== 'xlsx') throw new ApiError(400, 'Formato inválido', 'Usa format=csv ou format=xlsx.');
  const query = parseQuery(req, LeadListQuerySchema);
  const leads = await listAllLeads(ctx, query, { sort: query.sort, ascending: query.order === 'asc' });
  const file = await exportLeads(leads, format);
  return new Response(new Uint8Array(typeof file.body === 'string' ? Buffer.from(file.body) : file.body), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
