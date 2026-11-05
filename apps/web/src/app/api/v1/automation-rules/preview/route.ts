import { RulePreviewSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { previewRule } from '@/server/services/automation';

/** POST /api/v1/automation-rules/preview — quantos leads cumprem agora estas condições (sem fazer nada). */
export const POST = apiRoute(async (req, ctx) => json({ data: await previewRule(ctx, (await parseJson(req, RulePreviewSchema)).conditions) }));
