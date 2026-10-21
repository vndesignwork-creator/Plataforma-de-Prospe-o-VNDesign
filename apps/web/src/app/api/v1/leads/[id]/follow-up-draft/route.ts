import { apiRoute, json, parseId } from '@/server/http';
import { followUpDraft } from '@/server/services/lead-email';

/** GET /api/v1/leads/{id}/follow-up-draft — o próximo follow-up da sequência, já escrito, para rever e enviar. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await followUpDraft(ctx, parseId(id)) }));
