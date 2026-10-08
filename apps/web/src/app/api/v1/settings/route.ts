import { WorkspaceSettingsUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { isMailConfigured } from '@/server/mailer';
import { getSettings, updateSettings } from '@/server/services/workspace';

/** GET /api/v1/settings — definições do workspace (+ se o email está configurado). */
export const GET = apiRoute(async (_req, ctx) =>
  json({ data: { ...(await getSettings(ctx)), mail_configured: isMailConfigured() } }),
);

/** PATCH /api/v1/settings — dias de follow-up, linha de opt-out, resumo diário. */
export const PATCH = apiRoute(async (req, ctx) => {
  const patch = await parseJson(req, WorkspaceSettingsUpdateSchema);
  return json({ data: { ...(await updateSettings(ctx, patch)), mail_configured: isMailConfigured() } });
});
