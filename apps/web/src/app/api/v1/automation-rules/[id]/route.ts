import { AutomationRuleUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteRule, updateRule } from '@/server/services/automation';

type Params = { id: string };

/** PATCH /api/v1/automation-rules/{id} — mudar a regra ou ligá-la/desligá-la (enabled). */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await updateRule(ctx, parseId(id, 'Regra não encontrada'), await parseJson(req, AutomationRuleUpdateSchema)) }));

/** DELETE /api/v1/automation-rules/{id} — apagar a regra (o que já fez nos leads fica). */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteRule(ctx, parseId(id, 'Regra não encontrada'));
  return new Response(null, { status: 204 });
});
