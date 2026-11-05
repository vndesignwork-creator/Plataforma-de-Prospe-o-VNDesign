import { AutomationRuleCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createRule, listRules } from '@/server/services/automation';

/** GET /api/v1/automation-rules — as regras automáticas (condições → ações). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listRules(ctx) }));

/** POST /api/v1/automation-rules — nova regra (dono e administradores). */
export const POST = apiRoute(async (req, ctx) => json({ data: await createRule(ctx, await parseJson(req, AutomationRuleCreateSchema)) }, { status: 201 }));
