import { hasAiProvider } from '@/server/ai/providers';
import { apiRoute, json } from '@/server/http';
import { isMailConfigured } from '@/server/mailer';
import { prospectorAllowed } from '@/server/prospector-access';
import { listCustomFields } from '@/server/services/custom-fields';
import { leadTagCounts } from '@/server/services/leads';
import { getMailAccount } from '@/server/services/mail-account';
import { getPomodoro } from '@/server/services/pomodoro';
import { getRunningTimer } from '@/server/services/project-tools';
import { listSectors } from '@/server/services/sectors';
import { listServiceCategories } from '@/server/services/service-categories';
import { listServices } from '@/server/services/service-catalog';
import { listTemplates as listTaskTemplates } from '@/server/services/tasks';
import { teamNames } from '@/server/services/team';
import { listTemplates } from '@/server/services/templates';
import { getMe, getSettings, getSignature } from '@/server/services/workspace';

/**
 * GET /api/v1/app/bootstrap — o que todas as páginas pedem ao abrir, num só pedido (em vez de
 * ~15): o perfil, as definições, os serviços, os setores, as etiquetas, a equipa, os modelos e
 * todas as preferências desta pessoa. Os mesmos dados de cada pedido (GET /me, /settings,
 * /services?include_archived=true…). Uma parte que falhe, ou que o papel não deixa ver, vem a null
 * (o ecrã pede-a sozinho).
 */
export const GET = apiRoute(async (_req, ctx) => {
  const prospector = ctx.role === 'prospector';
  const allowed = (path: string) => !prospector || prospectorAllowed('GET', path);
  const part = <T,>(path: string, run: () => Promise<T>) => (allowed(path) ? run().catch(() => null) : Promise.resolve(null));
  const [me, settings, running, pomodoro, team, services, servicesAll, categories, sectors, sectorsAll, tags, customFields, mailAccount, signature, templates, taskTemplates, preferences] =
    await Promise.all([
      part('/me', () => getMe(ctx)),
      part('/settings', async () => ({ ...(await getSettings(ctx)), mail_configured: isMailConfigured(), ai_configured: await hasAiProvider(ctx) })),
      part('/time/running', () => getRunningTimer(ctx)),
      part('/pomodoro', () => getPomodoro(ctx)),
      part('/team/names', () => teamNames(ctx)),
      part('/services', () => listServices(ctx, false)),
      part('/services', () => listServices(ctx, true)),
      part('/service-categories', () => listServiceCategories(ctx)),
      part('/sectors', () => listSectors(ctx, false)),
      part('/sectors', () => listSectors(ctx, true)),
      part('/leads/tags', () => leadTagCounts(ctx)),
      part('/custom-fields', () => listCustomFields(ctx)),
      // Embrulhado: "sem conta" (null) não se confunde com "não veio".
      part('/mail-account', async () => ({ value: await getMailAccount(ctx) })),
      part('/signature', () => getSignature(ctx)),
      part('/templates', () => listTemplates(ctx)),
      part('/task-templates', () => listTaskTemplates(ctx)),
      part('/preferences/x', async () => {
        const { data } = await ctx.supabase.from('user_preferences').select('key, value').eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id);
        return Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
      }),
    ]);
  return json({
    data: {
      me,
      settings,
      time_running: running,
      pomodoro,
      team_names: team,
      services,
      services_all: servicesAll,
      service_categories: categories,
      sectors,
      sectors_all: sectorsAll,
      lead_tags: tags,
      custom_fields: customFields,
      mail_account: mailAccount,
      signature,
      templates,
      task_templates: taskTemplates,
      /** Todas as preferências guardadas desta pessoa (as que não estão aqui ainda não foram escolhidas). */
      preferences,
    },
  });
});
