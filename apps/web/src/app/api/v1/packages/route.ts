import { ServicePackageCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createPackage, listPackages } from '@/server/services/proposals';

/** GET /api/v1/packages — pacotes de serviços (?archived=true inclui os arquivados). */
export const GET = apiRoute(async (req, ctx) => {
  const archived = new URL(req.url).searchParams.get('archived') === 'true';
  return json({ data: await listPackages(ctx, archived) });
});

/** POST /api/v1/packages — novo pacote. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, ServicePackageCreateSchema);
  return json({ data: await createPackage(ctx, input) }, { status: 201 });
});
