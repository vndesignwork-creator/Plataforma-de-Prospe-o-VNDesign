import { ApiError, apiRoute, json } from '@/server/http';
import { getDashboard, getDashboardPeriod, getToday } from '@/server/services/dashboard';
import { getGoalProgress } from '@/server/services/goals';
import { billingSummary } from '@/server/services/payments';
import { listProjects } from '@/server/services/projects';
import { listReconnectClients } from '@/server/services/reconnect';
import { getReplies } from '@/server/services/replies';
import { listSiteMonitors } from '@/server/services/site-monitors';
import { getPreference, getSettings } from '@/server/services/workspace';

/**
 * GET /api/v1/dashboard/bundle — tudo o que o Dashboard mostra, num só pedido (em vez de 12):
 * os mesmos dados de /dashboard, /dashboard/today, /dashboard/period?period=month, /goals,
 * /replies?days=14, /projects?state=active, /dashboard/billing, /site-monitors,
 * /projects/reconnect?months=6 e as preferências do Dashboard. Uma parte que falhe vem a null
 * (o ecrã pede-a sozinho). Só para o dono e os administradores (a equipa de prospeção tem o seu).
 */
export const GET = apiRoute(async (_req, ctx) => {
  if (ctx.role === 'prospector') throw new ApiError(403, 'Sem acesso', 'A equipa de prospeção usa os pedidos de cada cartão.');
  const settings = await getSettings(ctx);
  const projectsOn = settings.features.projects !== false;
  const sitesOn = settings.features.site_monitoring !== false;
  const part = <T,>(p: Promise<T>) => p.catch(() => null);
  const [dashboard, today, period, goals, replies, projects, billing, siteMonitors, reconnect, cards, kpis, webmail] = await Promise.all([
    part(getDashboard(ctx)),
    part(getToday(ctx)),
    part(getDashboardPeriod(ctx, 'month')),
    part(getGoalProgress(ctx)),
    part(getReplies(ctx, 14)),
    projectsOn ? part(listProjects(ctx, 'active')) : Promise.resolve(null),
    projectsOn ? part(billingSummary(ctx)) : Promise.resolve(null),
    sitesOn ? part(listSiteMonitors(ctx)) : Promise.resolve(null),
    projectsOn ? part(listReconnectClients(ctx, { months: 6 })) : Promise.resolve(null),
    part(getPreference(ctx, 'dashboard.cards')),
    part(getPreference(ctx, 'dashboard.kpis')),
    part(getPreference(ctx, 'mail.webmail')),
  ]);
  return json({
    data: {
      dashboard,
      today,
      period,
      goals,
      replies,
      projects,
      billing,
      site_monitors: siteMonitors,
      reconnect,
      preferences: { 'dashboard.cards': cards, 'dashboard.kpis': kpis, 'mail.webmail': webmail },
    },
  });
});
