import { ClientErrorReportSchema } from '@vndesign/core';
import { apiRoute, parseJson } from '@/server/http';
import { reportClientError } from '@/server/services/platform';

/** POST /api/v1/platform/client-error — uma página falhou no navegador (fica em Definições → Estado da plataforma). */
export const POST = apiRoute(async (req, ctx) => {
  await reportClientError(ctx, await parseJson(req, ClientErrorReportSchema));
  return new Response(null, { status: 204 });
});
