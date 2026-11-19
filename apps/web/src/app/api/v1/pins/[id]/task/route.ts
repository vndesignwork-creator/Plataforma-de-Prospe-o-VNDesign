import { apiRoute, json, parseId } from '@/server/http';
import { createPinTask } from '@/server/services/project-tools';

/** POST /api/v1/pins/{id}/task — fazer uma tarefa do projeto a partir do comentário. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  return json({ data: await createPinTask(ctx, parseId(id, 'Comentário não encontrado')) }, { status: 201 });
});
