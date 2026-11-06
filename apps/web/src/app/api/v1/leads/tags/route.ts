import { LeadTagCreateSchema, LeadTagRenameSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createLeadTag, leadTagCounts, renameLeadTag } from '@/server/services/leads';

/** GET /api/v1/leads/tags — etiquetas usadas, com o número de leads (para sugerir e filtrar). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await leadTagCounts(ctx) }));

/** POST /api/v1/leads/tags — cria uma etiqueta (fica nas sugestões, mesmo sem leads); se já existe, devolve-a. */
export const POST = apiRoute(async (req, ctx) => {
  const { tag } = await parseJson(req, LeadTagCreateSchema);
  return json({ data: await createLeadTag(ctx, tag) }, { status: 201 });
});

/**
 * PATCH /api/v1/leads/tags — renomeia uma etiqueta em todos os leads ({ from, to });
 * para um nome que já existe junta as duas; to = null apaga-a.
 */
export const PATCH = apiRoute(async (req, ctx) => {
  const { from, to } = await parseJson(req, LeadTagRenameSchema);
  return json({ data: await renameLeadTag(ctx, from, to) });
});
