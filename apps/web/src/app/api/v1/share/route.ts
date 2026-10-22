import { SharePayloadSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { parseSharedLead } from '@/server/services/share';

// Pode abrir o site da empresa e perguntar ao Google (alguns segundos).
export const maxDuration = 30;

/** POST /api/v1/share — interpreta um link partilhado (Google Maps, Instagram, Facebook ou site) e devolve um lead por gravar. */
export const POST = apiRoute(async (req) => {
  const input = await parseJson(req, SharePayloadSchema);
  return json({ data: await parseSharedLead(input) });
});
