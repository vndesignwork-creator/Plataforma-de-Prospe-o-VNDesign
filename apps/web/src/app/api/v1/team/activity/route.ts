import { TeamActivityQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { teamActivity } from '@/server/services/team';

/** GET /api/v1/team/activity — o que cada pessoa fez nos leads (dono ou administrador). */
export const GET = apiRoute(async (req, ctx) => json({ data: await teamActivity(ctx, parseQuery(req, TeamActivityQuerySchema)) }));
