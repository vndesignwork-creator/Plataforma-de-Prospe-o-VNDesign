import { FreeAuditToggleSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { setFreeAudit } from '@/server/services/free-audit';

/** POST /api/v1/free-audit — ligar/desligar a página "Analisar o meu site grátis" (ou trocar o código). Dono ou administrador. */
export const POST = apiRoute(async (req, ctx) => json({ data: await setFreeAudit(ctx, await parseJson(req, FreeAuditToggleSchema)) }));
