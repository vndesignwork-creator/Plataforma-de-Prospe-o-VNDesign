import { LeadTaskReorderSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { reorderTasks } from '@/server/services/tasks';

/** POST /api/v1/leads/{id}/tasks/reorder — nova ordem ({ ids } pela ordem pretendida). */
export const POST = apiRoute<{ id: string }>(
  async (req, ctx, { id }) => {
    const { ids } = await parseJson(req, LeadTaskReorderSchema);
    return json({ data: await reorderTasks(ctx, parseId(id), ids) });
  },
  { token: 'leads:write' },
);
