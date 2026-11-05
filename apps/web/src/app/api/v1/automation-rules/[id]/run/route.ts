import { apiRoute, json, parseId } from '@/server/http';
import { runRuleNow } from '@/server/services/automation';

export const maxDuration = 120;

/** POST /api/v1/automation-rules/{id}/run — "Aplicar agora" a todos os leads que cumprem a regra (uma vez cada). */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await runRuleNow(ctx, parseId(id, 'Regra não encontrada')) }));
