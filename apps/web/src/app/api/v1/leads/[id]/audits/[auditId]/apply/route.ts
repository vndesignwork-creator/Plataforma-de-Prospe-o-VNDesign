import { AuditApplySchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { applyAudit } from '@/server/services/audits';

/** POST /api/v1/leads/{id}/audits/{auditId}/apply — copia PageSpeed/Mobile?/Problemas para o lead. */
export const POST = apiRoute<{ id: string; auditId: string }>(async (req, ctx, { id, auditId }) => {
  const input = await parseJson(req, AuditApplySchema);
  return json({ data: await applyAudit(ctx, parseId(id), parseId(auditId, 'Relatório'), input) });
});
