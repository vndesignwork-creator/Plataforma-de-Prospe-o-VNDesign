import { z } from 'zod';
import { apiRoute, json, parseJson } from '@/server/http';
import { UNLOCK_MINUTES, unlockWithPassword, unlockedUntil } from '@/server/services/unlock';

const UnlockSchema = z.object({ password: z.string().min(1, { error: 'Escreve a tua palavra-passe.' }) });

/** GET /api/v1/accesses/unlock — até quando está confirmado (null = é preciso confirmar). */
export const GET = apiRoute(async (_req, ctx) => json({ data: { until: unlockedUntil(ctx.user.id), minutes: UNLOCK_MINUTES } }));

/** POST /api/v1/accesses/unlock — confirmar a palavra-passe da conta. */
export const POST = apiRoute(async (req, ctx) => {
  const { password } = await parseJson(req, UnlockSchema);
  return json({ data: { until: await unlockWithPassword(ctx, password), minutes: UNLOCK_MINUTES } });
});
