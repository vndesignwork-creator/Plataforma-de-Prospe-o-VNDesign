import { ApiError, apiRoute, json, parseId } from '@/server/http';
import { brandFileUrl, deleteBrandFile } from '@/server/services/brand-kit';

type Params = { id: string; index: string };

function parseIndex(index: string): number {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) throw new ApiError(404, 'Ficheiro não encontrado');
  return n;
}

/** GET /api/v1/leads/{id}/brand-kit/files/{n} — descarregar (redireciona para um link temporário). */
export const GET = apiRoute<Params>(async (_req, ctx, { id, index }) => Response.redirect(await brandFileUrl(ctx, parseId(id), parseIndex(index)), 302));

/** DELETE /api/v1/leads/{id}/brand-kit/files/{n} — apagar um ficheiro do kit. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id, index }) => json({ data: await deleteBrandFile(ctx, parseId(id), parseIndex(index)) }));
