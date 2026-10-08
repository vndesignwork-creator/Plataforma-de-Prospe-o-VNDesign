import { LeadCreateSchema, LeadListQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseJson, parseQuery } from '@/server/http';
import { createLead, listLeads } from '@/server/services/leads';

/** GET /api/v1/leads — lista com filtros, pesquisa, ordenação e paginação. */
export const GET = apiRoute(async (req, ctx) => {
  const query = parseQuery(req, LeadListQuerySchema);
  const { data, total } = await listLeads(ctx, query);
  return json({ data, meta: { page: query.page, limit: query.limit, total } });
});

/**
 * POST /api/v1/leads — cria um lead.
 * 409 com `duplicates` se houver um duplicado forte — mesmo nome normalizado,
 * website ou email (repetir com ?force=true para criar mesmo assim);
 * 422 com `do_not_contact` se a empresa estiver na lista "não contactar".
 */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, LeadCreateSchema);
  const force = new URL(req.url).searchParams.get('force') === 'true';
  const lead = await createLead(ctx, input, { force });
  return json({ data: lead }, { status: 201 });
});
