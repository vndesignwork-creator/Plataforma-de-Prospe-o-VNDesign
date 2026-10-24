import { CustomFieldUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteCustomField, updateCustomField } from '@/server/services/custom-fields';

type Params = { id: string };

/** PATCH /api/v1/custom-fields/{id} — nome, opções (escolha) ou ordem. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) =>
  json({ data: await updateCustomField(ctx, parseId(id, 'Campo não encontrado'), await parseJson(req, CustomFieldUpdateSchema)) }),
);

/** DELETE /api/v1/custom-fields/{id} — apaga o campo e os valores dele em todos os leads. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteCustomField(ctx, parseId(id, 'Campo não encontrado'));
  return new Response(null, { status: 204 });
});
