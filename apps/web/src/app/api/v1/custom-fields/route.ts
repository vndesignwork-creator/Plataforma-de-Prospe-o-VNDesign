import { CustomFieldCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createCustomField, listCustomFields } from '@/server/services/custom-fields';

/** GET /api/v1/custom-fields — os campos personalizados dos leads. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listCustomFields(ctx) }), { token: 'leads:read' });

/** POST /api/v1/custom-fields — novo campo (texto, número, sim/não ou escolha). Só o dono ou um administrador. */
export const POST = apiRoute(async (req, ctx) => json({ data: await createCustomField(ctx, await parseJson(req, CustomFieldCreateSchema)) }, { status: 201 }));
