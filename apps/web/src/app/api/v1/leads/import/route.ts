import { IntegrationImportSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { importLeadsFromApi } from '@/server/services/integration-import';

/**
 * POST /api/v1/leads/import — importa leads em JSON (token com "leads:import").
 * Cabeçalho opcional Idempotency-Key: repetir o pedido devolve a mesma resposta
 * sem criar leads outra vez.
 */
export const POST = apiRoute(
  async (req, ctx) => {
    const input = await parseJson(req, IntegrationImportSchema);
    const { status, body } = await importLeadsFromApi(ctx, input, req.headers.get('idempotency-key'));
    return json({ data: body }, { status });
  },
  { token: 'leads:import' },
);
