import { apiRoute, json, parseId } from '@/server/http';
import { summarizeLead } from '@/server/services/lead-summary';

export const maxDuration = 60;
type Params = { id: string };

/** POST /api/v1/leads/{id}/summary — resumo do lead com IA (quem é, o que se falou, o combinado, o próximo passo). Não grava. */
export const POST = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await summarizeLead(ctx, parseId(id)) }));
