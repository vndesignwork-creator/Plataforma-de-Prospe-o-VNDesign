import { CommentCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createComment } from '@/server/services/team-work';

type Params = { id: string };

/** POST /api/v1/leads/{id}/comments — comentário da equipa na linha do tempo (as pessoas mencionadas recebem um aviso). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, CommentCreateSchema);
  return json({ data: await createComment(ctx, parseId(id), input) }, { status: 201 });
});
