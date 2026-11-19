import { AbVariantRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { writeAbVariant } from '@/server/services/ab-variant';

export const maxDuration = 60;

/** POST /api/v1/templates/ab-variant — a IA escreve a versão B de um modelo (teste A/B). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, AbVariantRequestSchema);
  return json({ data: await writeAbVariant(ctx, input) });
});
