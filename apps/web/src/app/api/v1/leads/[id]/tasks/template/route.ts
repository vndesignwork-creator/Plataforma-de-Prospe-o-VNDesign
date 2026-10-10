import { ApplyTaskTemplateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { applyTemplate } from '@/server/services/tasks';

/** POST /api/v1/leads/{id}/tasks/template — acrescenta as tarefas de uma lista-modelo. */
export const POST = apiRoute<{ id: string }>(
  async (req, ctx, { id }) => {
    const { template_id } = await parseJson(req, ApplyTaskTemplateSchema);
    return json({ data: await applyTemplate(ctx, parseId(id), template_id) });
  },
  { token: 'leads:write' },
);
