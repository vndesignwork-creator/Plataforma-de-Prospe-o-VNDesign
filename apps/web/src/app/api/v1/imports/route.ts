import { ImportCommitSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { commitImport, listImports } from '@/server/services/imports';

/** GET /api/v1/imports — histórico de importações. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listImports(ctx) }));

/** POST /api/v1/imports — grava as linhas confirmadas (criar / juntar / ignorar). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, ImportCommitSchema);
  return json({ data: await commitImport(ctx, input) }, { status: 201 });
});
