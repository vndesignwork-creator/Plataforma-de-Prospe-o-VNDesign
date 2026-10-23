import { apiRoute, json, parseId } from '@/server/http';
import { generateFaq } from '@/server/services/geo-kit';

export const maxDuration = 60;
type Params = { id: string };

/** POST /api/v1/leads/{id}/geo/faq — a IA escreve 8 a 10 perguntas frequentes (substitui as atuais). */
export const POST = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await generateFaq(ctx, parseId(id)) }));
