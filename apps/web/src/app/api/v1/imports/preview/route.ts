import { ImportPreviewRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { previewImport } from '@/server/services/imports';

/** POST /api/v1/imports/preview — valida as linhas e procura duplicados (não grava). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, ImportPreviewRequestSchema);
  return json({ data: await previewImport(ctx, input) });
});
