import { NextResponse } from 'next/server';
import { ApiError, apiRoute, parseId } from '@/server/http';
import { clientRequestFileUrl } from '@/server/services/client-requests';

type Params = { id: string; index: string };

/** GET /api/v1/client-requests/{id}/files/{n} — descarregar um ficheiro que o cliente enviou (link temporário). */
export const GET = apiRoute<Params>(async (_req, ctx, { id, index }) => {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) throw new ApiError(404, 'Ficheiro não encontrado');
  return NextResponse.redirect(await clientRequestFileUrl(ctx, parseId(id, 'Pedido não encontrado'), i), 302);
});
