import { apiRoute, parseId } from '@/server/http';
import { deleteExpense } from '@/server/services/project-tools';

/** DELETE /api/v1/expenses/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteExpense(ctx, parseId(id, 'Despesa não encontrada'));
  return new Response(null, { status: 204 });
});
