/**
 * Estado da plataforma (Definições → Estado da plataforma):
 *  - quando correram as tarefas automáticas (cron do hPanel: lembretes de 5 em 5 minutos e o
 *    resumo diário) e um aviso (sino + email) quando param;
 *  - os problemas em segundo plano (um email que não saiu, uma caixa de email que não liga,
 *    um erro inesperado), juntos por tipo, com quantas vezes aconteceram.
 */
import type { AuditEvent, ClientErrorReport, PlatformProblem, PlatformStatus } from '@vndesign/core';
import { CRON_DIGEST_LATE_MS, CRON_REMINDERS_LATE_MS, cronState, formatDateTime } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { isMailConfigured, sendMail } from '../mailer';
import { createSupabaseAdminClient } from '../supabase-admin';
import { saveAlert } from './push';
import { teamNames } from './team';

const missing = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(e.code ?? '');

/** O cron acabou de correr (chama-se no fim de cada corrida). */
export async function cronHeartbeat(job: 'reminders' | 'digest'): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc('vnd_cron_heartbeat', { p_job: job });
  if (error && !missing(error)) console.warn('[estado] cron', error.message);
}

async function owners(workspaceId: string): Promise<string[]> {
  const { data } = await createSupabaseAdminClient().from('workspace_members').select('user_id').eq('workspace_id', workspaceId).in('role', ['owner', 'admin']);
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

export interface ProblemInput {
  /** De que parte: 'email', 'mailbox', 'digest', 'backup', 'lead_generation', 'error'… */
  area: string;
  /** O mesmo problema repetido junta-se (ex.: o id da caixa de email). */
  key: string;
  /** Em linguagem simples ("O email para X não saiu"). */
  title: string;
  detail?: string | null;
  /** Avisar no sino (dono e administradores) quando aparece — só o que a pessoa tem de resolver. */
  notify?: boolean;
}

/**
 * Regista um problema (ou soma +1 ao igual ainda por resolver). Nunca lança: um problema
 * a registar um problema só fica no registo do servidor.
 */
export async function reportProblem(workspaceId: string, p: ProblemInput): Promise<void> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc('vnd_report_problem', {
      p_workspace_id: workspaceId,
      p_area: p.area,
      p_key: p.key,
      p_title: p.title,
      p_detail: p.detail ?? null,
    });
    if (error) {
      if (!missing(error)) console.warn('[estado] problema', error.message);
      return;
    }
    if (data === true && p.notify) {
      for (const userId of await owners(workspaceId)) {
        await saveAlert(workspaceId, userId, { kind: 'system', title: `⚠️ ${p.title}`, body: p.detail ?? 'Vê em Definições → Estado da plataforma.', url: '/definicoes/estado', tag: `problem-${p.area}-${p.key}` });
      }
    }
  } catch (e) {
    console.warn('[estado] problema', e instanceof Error ? e.message : e);
  }
}

/** O problema deixou de acontecer (ex.: a caixa de email voltou a ligar). */
export async function resolveProblem(workspaceId: string, area: string, key: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('platform_problems')
    .update({ resolved_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('area', area)
    .eq('key', key)
    .is('resolved_at', null);
  if (error && !missing(error)) console.warn('[estado] resolver', error.message);
}

const PROBLEM_SELECT = 'id, area, title, detail, count, first_at, last_at, resolved_at';

export async function getPlatformStatus(ctx: ApiContext): Promise<PlatformStatus> {
  void checkCronStaleness();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [status, problems] = await Promise.all([
    ctx.supabase.from('platform_status').select('reminders_at, digest_at').eq('workspace_id', ctx.workspaceId).maybeSingle(),
    ctx.supabase
      .from('platform_problems')
      .select(PROBLEM_SELECT)
      .eq('workspace_id', ctx.workspaceId)
      .or(`resolved_at.is.null,last_at.gte.${since}`)
      .order('resolved_at', { ascending: false, nullsFirst: true })
      .order('last_at', { ascending: false })
      .limit(50),
  ]);
  if (status.error && !missing(status.error)) throw fromPostgrest(status.error);
  if (problems.error && !missing(problems.error)) throw fromPostgrest(problems.error);
  const reminders = (status.data?.reminders_at as string | null | undefined) ?? null;
  const digest = (status.data?.digest_at as string | null | undefined) ?? null;
  const now = Date.now();
  return {
    reminders_at: reminders,
    digest_at: digest,
    reminders: cronState(reminders, CRON_REMINDERS_LATE_MS, now),
    digest: cronState(digest, CRON_DIGEST_LATE_MS, now),
    mail_configured: isMailConfigured(),
    problems: (problems.data ?? []) as PlatformProblem[],
  };
}

export async function resolveProblemById(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('platform_problems')
    .update({ resolved_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, 'Problema não encontrado');
}

/**
 * As tarefas automáticas pararam? (Corre quando alguém abre a plataforma e quando o plugin
 * de WordPress pede a configuração — sem o cron, é o que ainda chega.) Um aviso por paragem:
 * no sino do dono e por email.
 */
let lastStaleCheck = 0;
export async function checkCronStaleness(now = Date.now()): Promise<number> {
  if (now - lastStaleCheck < 10 * 60_000) return 0;
  lastStaleCheck = now;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('platform_status')
      .select('workspace_id, reminders_at, digest_at, stale_alerted_at')
      .lt('reminders_at', new Date(now - CRON_REMINDERS_LATE_MS).toISOString())
      .limit(200);
    if (error) return 0;
    let alerted = 0;
    for (const row of (data ?? []) as { workspace_id: string; reminders_at: string; stale_alerted_at: string | null }[]) {
      // Já avisado desta paragem (o cron não voltou a correr desde o aviso).
      if (row.stale_alerted_at && row.stale_alerted_at > row.reminders_at) continue;
      const since = formatDateTime(row.reminders_at);
      const title = '⚠️ As tarefas automáticas pararam';
      const body = `Não correm desde ${since}: os lembretes, a verificação dos sites e a leitura dos emails estão parados. Vê o cron no hPanel.`;
      for (const userId of await owners(row.workspace_id)) {
        await saveAlert(row.workspace_id, userId, { kind: 'system', title, body, url: '/definicoes/estado', tag: `cron-stale-${row.reminders_at}` });
        if (isMailConfigured()) {
          const { data: user } = await admin.auth.admin.getUserById(userId);
          const to = user?.user?.email;
          if (to) {
            await sendMail({
              to,
              subject: 'As tarefas automáticas da VNDesign Leads pararam',
              text: `${body}\n\nO que fazer: no hPanel → Avançado → Tarefas Cron, confirma que a tarefa dos lembretes (de 5 em 5 minutos) está lá e ativa. Os pormenores estão na plataforma, em Definições → Estado da plataforma.`,
              html: `<p>${body}</p><p><strong>O que fazer:</strong> no hPanel → Avançado → Tarefas Cron, confirma que a tarefa dos lembretes (de 5 em 5 minutos) está lá e ativa.</p><p>Os pormenores estão na plataforma, em Definições → Estado da plataforma.</p>`,
            }).catch((e) => console.warn('[estado] email', e instanceof Error ? e.message : e));
          }
        }
      }
      await admin.from('platform_status').update({ stale_alerted_at: new Date(now).toISOString() }).eq('workspace_id', row.workspace_id);
      alerted++;
    }
    return alerted;
  } catch (e) {
    console.warn('[estado] cron parado', e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Para os testes: volta a deixar ver já. */
export function resetStaleCheck() {
  lastStaleCheck = 0;
}

// No máximo 20 erros do ecrã por pessoa e hora (um ecrã em ciclo não enche o registo).
const screenHits = new Map<string, number[]>();

/** Uma página falhou no navegador: fica em Estado da plataforma (os iguais juntam-se). */
export async function reportClientError(ctx: ApiContext, report: ClientErrorReport): Promise<void> {
  const now = Date.now();
  const recent = (screenHits.get(ctx.user.id) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  screenHits.set(ctx.user.id, recent);
  if (screenHits.size > 5000) screenHits.clear();
  if (recent.length > 20) return;
  // Sem os ids nem o número do lead no caminho: o mesmo erro em leads diferentes junta-se.
  const page = report.page.split('?')[0]!.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/\d+(-[^/]*)?(?=\/|$)/g, '/:n');
  await reportProblem(ctx.workspaceId, {
    area: 'screen',
    key: `${page} ${report.message.slice(0, 80)}`,
    title: `Uma página falhou no ecrã (${page})`,
    detail: `${report.message}${report.digest ? ` (código ${report.digest})` : ''}`,
  });
}

/** O registo de alterações (os últimos 200; RLS: só o dono e os administradores). */
export async function listAuditEvents(ctx: ApiContext): Promise<AuditEvent[]> {
  const { data, error } = await ctx.supabase
    .from('audit_events')
    .select('id, at, action, summary, actor_user_id, actor_token_id')
    .eq('workspace_id', ctx.workspaceId)
    .order('at', { ascending: false })
    .limit(200);
  if (missing(error)) return [];
  if (error) throw fromPostgrest(error);
  const names = new Map((await teamNames(ctx)).map((m) => [m.user_id, m.name]));
  return ((data ?? []) as { id: number; at: string; action: string; summary: string; actor_user_id: string | null; actor_token_id: string | null }[]).map((r) => ({
    id: r.id,
    at: r.at,
    action: r.action,
    summary: r.summary,
    actor: r.actor_token_id ? 'Integração (API)' : r.actor_user_id ? (names.get(r.actor_user_id) ?? 'Antigo membro') : 'Antigo membro',
  }));
}
