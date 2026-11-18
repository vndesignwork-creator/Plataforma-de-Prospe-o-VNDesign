import { apiRoute, json } from '@/server/http';
import { listClients } from '@/server/services/clients';

/** GET /api/v1/clients — os clientes, um por empresa (separador Clientes da página Projetos). */
export const GET = apiRoute(async (_req, ctx) => {
  return json({ data: await listClients(ctx) });
});
