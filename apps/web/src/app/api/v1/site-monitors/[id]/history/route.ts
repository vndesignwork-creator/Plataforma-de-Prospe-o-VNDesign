import type { SiteMonitorHistory } from '@vndesign/core';
import { ApiError, apiRoute, json, parseId } from '@/server/http';
import { siteMonitorHistory } from '@/server/services/site-monitors';

type Params = { id: string };

/** GET /api/v1/site-monitors/{id}/history?days=30 — tempo no ar, quebras e tempo de resposta dos últimos N dias (1–366). */
export const GET = apiRoute<Params>(async (req, ctx, { id }) => {
  const raw = new URL(req.url).searchParams.get('days') ?? '30';
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new ApiError(400, 'Período inválido', 'days tem de ser um número de 1 a 366.');
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const history = await siteMonitorHistory(ctx, parseId(id, 'Vigilância do site não encontrada'), from, to);
  const data: SiteMonitorHistory = { ...history };
  delete (data as Partial<typeof history>).lead_id;
  return json({ data });
});
