import { publicOrigin } from '@/lib/public-url';
import { cronAuthorized } from '@/server/cron-auth';
import { handleError, json, problemResponse } from '@/server/http';
import { sendTaskReminders } from '@/server/services/push';
import { runDueSchedules } from '@/server/services/lead-generation-schedules';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/v1/cron/reminders — envia as notificações dos lembretes das
 * tarefas que já chegaram à hora e lança as pesquisas automáticas do gerador
 * de leads. Chamar de 5 em 5 minutos (cron do hPanel).
 * Autenticação: "Authorization: Bearer CRON_SECRET". ?dry_run=true não envia.
 */
async function handler(req: Request) {
  if (!cronAuthorized(req)) return problemResponse(401, 'Não autorizado', 'CRON_SECRET em falta ou inválido.');
  try {
    const dryRun = new URL(req.url).searchParams.get('dry_run') === 'true';
    const [data, leadGeneration] = await Promise.all([
      sendTaskReminders({ dryRun }),
      runDueSchedules({ appUrl: publicOrigin(req), dryRun }),
    ]);
    return json({ data, lead_generation: leadGeneration });
  } catch (e) {
    return handleError(e);
  }
}

export const GET = handler;
export const POST = handler;
