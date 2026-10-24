import { CardScanInputSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { scanBusinessCard } from '@/server/services/card-scan';

export const maxDuration = 60;

/** POST /api/v1/leads/card-scan — lê a fotografia de um cartão de visita ({ image: data URL }) e devolve os dados do lead (não grava). */
export const POST = apiRoute(async (req, ctx) => {
  const { image } = await parseJson(req, CardScanInputSchema);
  return json({ data: await scanBusinessCard(ctx, image) });
});
