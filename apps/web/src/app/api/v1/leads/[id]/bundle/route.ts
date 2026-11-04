import { apiRoute, json, parseId } from '@/server/http';
import { leadBundle } from '@/server/services/lead-bundle';

type Params = { id: string };

/**
 * GET /api/v1/leads/{id}/bundle — a ficha do lead num só pedido (o lead e os cartões).
 * Só com sessão: a maior parte das partes não aceita tokens de integração.
 */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await leadBundle(ctx, parseId(id)) }));
