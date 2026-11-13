import { apiRoute, json } from '@/server/http';
import { aiUsageSummary } from '@/server/services/ai-usage';

/** GET /api/v1/ai/usage?month=AAAA-MM — consumo da IA no mês (por função, pessoa e modelo) e os créditos que restam (estimativa). */
export const GET = apiRoute(async (req, ctx) => json({ data: await aiUsageSummary(ctx, new URL(req.url).searchParams.get('month') ?? undefined) }));
