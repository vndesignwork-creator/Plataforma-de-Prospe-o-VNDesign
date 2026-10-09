import { SiteAuditRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { listAudits, runLeadAudit } from '@/server/services/audits';

// A análise pode demorar (o PageSpeed leva 10–40 s).
export const maxDuration = 60;

type Params = { id: string };

/** GET /api/v1/leads/{id}/audits — histórico de análises do site (mais recente primeiro). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listAudits(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/audits — analisa o website do lead (ou o `url` indicado). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, SiteAuditRequestSchema);
  return json({ data: await runLeadAudit(ctx, parseId(id), input.url) }, { status: 201 });
});
