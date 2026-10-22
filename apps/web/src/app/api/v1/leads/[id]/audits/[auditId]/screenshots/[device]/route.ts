import { SCREENSHOT_DEVICES, type ScreenshotDevice } from '@vndesign/core';
import { ApiError, apiRoute, parseId } from '@/server/http';
import { screenshotUrl } from '@/server/services/audits';

type Params = { id: string; auditId: string; device: string };

/** GET /api/v1/leads/{id}/audits/{auditId}/screenshots/{device} — a imagem do site (redireciona para um link temporário). */
export const GET = apiRoute<Params>(async (_req, ctx, { id, auditId, device }) => {
  if (!SCREENSHOT_DEVICES.includes(device as ScreenshotDevice)) throw new ApiError(404, 'Imagem não encontrada');
  const url = await screenshotUrl(ctx, parseId(id), parseId(auditId, 'Análise não encontrada'), device as ScreenshotDevice);
  return Response.redirect(url, 302);
});
