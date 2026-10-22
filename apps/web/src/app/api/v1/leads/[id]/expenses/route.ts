import { ProjectExpenseCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createExpense, listExpenses } from '@/server/services/project-tools';

/** GET /api/v1/leads/{id}/expenses — despesas do projeto. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listExpenses(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/expenses — registar uma despesa (alojamento, plugins, fotos…). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProjectExpenseCreateSchema);
  return json({ data: await createExpense(ctx, parseId(id), input) }, { status: 201 });
});
