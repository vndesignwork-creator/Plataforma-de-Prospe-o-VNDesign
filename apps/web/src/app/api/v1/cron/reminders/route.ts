import { publicOrigin } from '@/lib/public-url';
import { cronAuthorized } from '@/server/cron-auth';
import { handleError, json, problemResponse } from '@/server/http';
import { sendTaskReminders } from '@/server/services/push';
import { runDueSchedules } from '@/server/services/lead-generation-schedules';
import { checkAllInboxes } from '@/server/services/inbox';
import { sendMeetingReminders } from '@/server/services/meetings';
import { advancePomodoros } from '@/server/services/pomodoro';
import { runSiteMonitors } from '@/server/services/site-monitors';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/v1/cron/reminders — envia as notificações dos lembretes das
 * tarefas que já chegaram à hora, lança as pesquisas automáticas do gerador
 * de leads, lê as caixas de entrada (respostas dos leads, de 10 em 10 minutos)
 * avisa 1 hora antes de cada reunião e avança os pomodoros que acabaram com a
 * app fechada (notificação "Pausa" / "Volta ao trabalho") e verifica os sites dos
 * clientes vigiados (de hora a hora cada um).
 * Chamar de 5 em 5 minutos (cron do hPanel).
 * Autenticação: "Authorization: Bearer CRON_SECRET". ?dry_run=true não envia.
 */
async function handler(req: Request) {
  if (!cronAuthorized(req)) return problemResponse(401, 'Não autorizado', 'CRON_SECRET em falta ou inválido.');
  try {
    const dryRun = new URL(req.url).searchParams.get('dry_run') === 'true';
    const [data, leadGeneration, replies, meetings, pomodoros, sites] = await Promise.all([
      sendTaskReminders({ dryRun }),
      runDueSchedules({ appUrl: publicOrigin(req), dryRun }),
      checkAllInboxes({ dryRun }),
      sendMeetingReminders({ dryRun }),
      advancePomodoros({ dryRun }),
      // Um problema nos sites nunca pode parar os lembretes.
      runSiteMonitors({ dryRun }).catch((e: unknown) => ({ due: 0, checked: 0, skipped: e instanceof Error ? e.message : 'erro' })),
    ]);
    return json({ data, lead_generation: leadGeneration, replies, meetings, pomodoros, sites });
  } catch (e) {
    return handleError(e);
  }
}

export const GET = handler;
export const POST = handler;
