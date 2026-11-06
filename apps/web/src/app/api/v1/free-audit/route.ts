import { FreeAuditConfigSchema, FreeAuditToggleSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { setFreeAudit, setFreeAuditConfig } from '@/server/services/free-audit';

/** POST /api/v1/free-audit — ligar/desligar a página "Analisar o meu site grátis" (ou trocar o código). Dono ou administrador. */
export const POST = apiRoute(async (req, ctx) => json({ data: await setFreeAudit(ctx, await parseJson(req, FreeAuditToggleSchema)) }));

/** PATCH /api/v1/free-audit — follow-up automático e Cloudflare Turnstile. Dono ou administrador. */
export const PATCH = apiRoute(async (req, ctx) => json({ data: await setFreeAuditConfig(ctx, await parseJson(req, FreeAuditConfigSchema)) }));
