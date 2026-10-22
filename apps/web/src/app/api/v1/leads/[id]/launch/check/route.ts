import { apiRoute, json, parseId } from '@/server/http';
import { runLaunchChecks } from '@/server/services/launch';

// Lê o site e pede o PageSpeed (até 1 minuto).
export const maxDuration = 60;

/** POST /api/v1/leads/{id}/launch/check — verifica sozinho os pontos automáticos no site novo. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await runLaunchChecks(ctx, parseId(id)) }));
