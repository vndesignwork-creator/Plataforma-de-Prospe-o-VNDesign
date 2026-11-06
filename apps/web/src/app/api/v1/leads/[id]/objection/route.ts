import { ObjectionRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { replyToObjection } from '@/server/services/objections';

type Params = { id: string };

/** POST /api/v1/leads/{id}/objection — resposta pronta a uma objeção ("É caro"…), para o telefone, WhatsApp ou email. */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await replyToObjection(ctx, parseId(id), await parseJson(req, ObjectionRequestSchema)) }));
