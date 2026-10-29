import { apiRoute, json, parseId } from '@/server/http';
import { markRepliesHandled } from '@/server/services/replies';

/** POST /api/v1/leads/{id}/replies/handled — "Já tratei": as respostas recebidas até agora deixam de estar por responder. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await markRepliesHandled(ctx, parseId(id)) }));
