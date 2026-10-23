import { SiteFormToggleSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { setSiteForm } from '@/server/services/site-form';

/** POST /api/v1/site-form — ligar/desligar o formulário do site (ou trocar o código). Dono ou administrador. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, SiteFormToggleSchema);
  return json({ data: await setSiteForm(ctx, input) });
});
