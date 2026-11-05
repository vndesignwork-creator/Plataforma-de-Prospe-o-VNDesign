import { ClientRequestUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteClientRequest, updateClientRequest } from '@/server/services/client-requests';

type Params = { id: string };

/** PATCH /api/v1/client-requests/{id} — mudar o texto ou o estado (Por enviar, Enviado, Recebido). */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await updateClientRequest(ctx, parseId(id, 'Pedido não encontrado'), await parseJson(req, ClientRequestUpdateSchema)) }));

/** DELETE /api/v1/client-requests/{id} — tirar o pedido (e os ficheiros que o cliente enviou). */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteClientRequest(ctx, parseId(id, 'Pedido não encontrado'));
  return new Response(null, { status: 204 });
});
