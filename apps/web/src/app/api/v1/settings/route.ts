import { WorkspaceSettingsUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { hasAiProvider } from '@/server/ai/providers';
import { isMailConfigured } from '@/server/mailer';
import { getSettings, updateSettings } from '@/server/services/workspace';

/** GET /api/v1/settings — definições do workspace (+ se o email e a IA estão configurados). */
export const GET = apiRoute(async (_req, ctx) =>
  json({ data: { ...(await getSettings(ctx)), mail_configured: isMailConfigured(), ai_configured: await hasAiProvider(ctx) } }),
);

/** PATCH /api/v1/settings — follow-up, opt-out, resumo diário, textos das propostas e IA de cada função. */
export const PATCH = apiRoute(async (req, ctx) => {
  const patch = await parseJson(req, WorkspaceSettingsUpdateSchema);
  return json({ data: { ...(await updateSettings(ctx, patch)), mail_configured: isMailConfigured(), ai_configured: await hasAiProvider(ctx) } });
});
