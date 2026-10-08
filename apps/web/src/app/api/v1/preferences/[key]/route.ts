import { PreferenceValueSchema } from '@vndesign/core';
import { ApiError, apiRoute, json, parseJson } from '@/server/http';
import { getPreference, setPreference } from '@/server/services/workspace';

type Params = { key: string };

function parseKey(key: string): string {
  if (!/^[a-z0-9_.-]{1,64}$/.test(key)) throw new ApiError(400, 'Chave inválida');
  return key;
}

/** GET /api/v1/preferences/{key} — ex.: "leads.table" (colunas visíveis). */
export const GET = apiRoute<Params>(async (_req, ctx, { key }) =>
  json({ data: { value: await getPreference(ctx, parseKey(key)) } }),
);

/** PUT /api/v1/preferences/{key} */
export const PUT = apiRoute<Params>(async (req, ctx, { key }) => {
  const { value } = await parseJson(req, PreferenceValueSchema);
  return json({ data: { value: await setPreference(ctx, parseKey(key), value) } });
});
