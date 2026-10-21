import { apiRoute, json } from '@/server/http';
import { checkReplies } from '@/server/services/inbox';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST /api/v1/mail-account/check-replies — lê já a caixa de entrada e regista as respostas dos leads. */
export const POST = apiRoute(async (_req, ctx) => json({ data: await checkReplies(ctx) }));
