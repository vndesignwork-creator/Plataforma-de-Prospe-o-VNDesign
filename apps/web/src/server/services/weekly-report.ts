/**
 * Resumo da semana por email (à segunda-feira, pelo cron do resumo diário, ao dono e aos
 * administradores): leads novos e de onde vieram, respostas e clientes novos, sites dos
 * clientes que caíram ou ficaram lentos, o gasto da IA e os problemas da plataforma por
 * resolver. Liga/desliga em Definições → Funcionalidades.
 */
import {
  LEAD_ORIGIN_META,
  SLOW_SITE_MS,
  WorkspaceSettingsSchema,
  addDays,
  buildWeeklyReport,
  lisbonDayStart,
  todayIso,
  type LeadOrigin,
  type WeeklyReportData,
} from '@vndesign/core';
import { spentThisMonth } from '../ai/budget';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { isMailConfigured, sendMail, sendWithAccount } from '../mailer';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { statsPeriod } from './dashboard';
import { loadSmtpAccount } from './mail-account';
import { reportProblem, resolveProblem } from './platform';
import { getSettings } from './workspace';

/** Início de um dia de Lisboa (AAAA-MM-DD) em UTC. */
const dayStart = (iso: string) => lisbonDayStart(new Date(`${iso}T12:00:00Z`));

/** Os números dos 7 dias antes de hoje (à segunda-feira: de segunda a domingo). */
export async function weeklyReportData(ctx: ApiContext, appUrl: string, now = new Date()): Promise<WeeklyReportData> {
  const today = todayIso(now);
  const from = addDays(today, -7);
  const to = addDays(today, -1);
  const fromTs = dayStart(from);
  const toTs = dayStart(today);
  const admin = createSupabaseAdminClient();
  const ws = ctx.workspaceId;
  const [settings, stats, leads, monitors, checks, ai, monthAi, problems] = await Promise.all([
    getSettings(ctx),
    statsPeriod(ctx, from, to),
    admin.from('leads').select('origin').eq('workspace_id', ws).is('client_of', null).is('anonymized_at', null).gte('created_at', fromTs).lt('created_at', toTs).limit(10_000),
    admin.from('site_monitors').select('id, url, lead:leads!inner(company_name)').eq('workspace_id', ws).eq('active', true).limit(500),
    admin.from('site_monitor_checks').select('monitor_id, ok, down, response_ms').eq('workspace_id', ws).gte('checked_at', fromTs).lt('checked_at', toTs).limit(20_000),
    admin.from('ai_usage').select('cost_usd').eq('workspace_id', ws).gte('at', fromTs).lt('at', toTs).not('cost_usd', 'is', null).limit(20_000),
    spentThisMonth(ws),
    admin.from('platform_problems').select('title, count').eq('workspace_id', ws).is('resolved_at', null).order('last_at', { ascending: false }).limit(5),
  ]);

  const origins = new Map<string, number>();
  for (const l of (leads.data ?? []) as { origin: LeadOrigin | null }[]) {
    const label = l.origin ? (LEAD_ORIGIN_META[l.origin]?.label ?? l.origin) : 'Sem registo';
    origins.set(label, (origins.get(label) ?? 0) + 1);
  }

  const names = new Map(((monitors.data ?? []) as unknown as { id: string; url: string; lead: { company_name: string } | null }[]).map((m) => [m.id, m.lead?.company_name ?? m.url]));
  const perSite = new Map<string, { down: number; ms: number[] }>();
  for (const c of (checks.data ?? []) as { monitor_id: string; ok: boolean; down: boolean; response_ms: number | null }[]) {
    if (!names.has(c.monitor_id)) continue;
    const s = perSite.get(c.monitor_id) ?? { down: 0, ms: [] };
    if (c.down) s.down += 1;
    if (c.ok && c.response_ms !== null) s.ms.push(c.response_ms);
    perSite.set(c.monitor_id, s);
  }
  const down: WeeklyReportData['sites']['down'] = [];
  const slow: WeeklyReportData['sites']['slow'] = [];
  for (const [id, s] of perSite) {
    if (s.down) down.push({ name: names.get(id)!, checks: s.down });
    const avg = s.ms.length ? s.ms.reduce((a, b) => a + b, 0) / s.ms.length : 0;
    if (!s.down && avg > SLOW_SITE_MS) slow.push({ name: names.get(id)!, ms: Math.round(avg) });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    from,
    to,
    new_leads: stats.new_leads,
    by_origin: [...origins.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    contacted: stats.contacted,
    replied: stats.replied,
    proposals: stats.proposals,
    won: stats.won,
    received: settings.features.payments ? stats.received : null,
    sites: { down: down.sort((a, b) => b.checks - a.checks), slow: slow.sort((a, b) => b.ms - a.ms) },
    ai: {
      spent_usd: round(((ai.data ?? []) as { cost_usd: number | string }[]).reduce((sum, r) => sum + Number(r.cost_usd), 0)),
      month_usd: round(monthAi),
      budget_usd: settings.ai_budget.monthly_usd,
    },
    problems: ((problems.data ?? []) as { title: string; count: number }[]).map((p) => ({ title: p.title, count: p.count })),
    url: appUrl,
  };
}

async function deliver(ctx: ApiContext, to: string, message: { subject: string; text: string; html: string }) {
  // Pelo SMTP do servidor; sem ele, pela conta de envio de quem pede (ou do dono, no cron).
  if (isMailConfigured()) return sendMail({ to, ...message });
  const account = await loadSmtpAccount(ctx).catch(() => null);
  if (account) return sendWithAccount(account.account, { to, ...message });
  throw new ApiError(422, 'Sem email para enviar', 'Liga a tua conta em Definições → Email de envio para receber o resumo.');
}

/** "Enviar agora": o resumo dos últimos 7 dias para quem pede. */
export async function sendWeeklyReportNow(ctx: ApiContext, appUrl: string): Promise<{ sent_to: string }> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem permissão', 'Só o dono e os administradores recebem o resumo da semana.');
  if (!ctx.user.email) throw new ApiError(422, 'Sem email', 'A tua conta não tem email.');
  await deliver(ctx, ctx.user.email, buildWeeklyReport(await weeklyReportData(ctx, appUrl)));
  return { sent_to: ctx.user.email };
}

export interface WeeklyReportCronResult {
  workspace_id: string;
  status: 'sent' | 'error' | 'dry_run';
  sent_to?: number;
  error?: string;
}

const isMonday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 1;

/** Cron (todas as manhãs): à segunda-feira, o resumo da semana ao dono e aos administradores. */
export async function runWeeklyReports(options: { appUrl: string; dryRun?: boolean; now?: Date }): Promise<WeeklyReportCronResult[]> {
  const today = todayIso(options.now);
  if (!isMonday(today)) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('workspaces').select('id, settings');
  if (error) throw new Error(error.message);
  const results: WeeklyReportCronResult[] = [];
  for (const row of (data ?? []) as { id: string; settings: unknown }[]) {
    const settings = WorkspaceSettingsSchema.parse(row.settings ?? {});
    const report = settings.weekly_report;
    // Um por semana (o cron pode correr mais do que uma vez no mesmo dia).
    if (!report.enabled || (report.last_sent_at && Date.now() - new Date(report.last_sent_at).getTime() < 6 * 86_400_000)) continue;
    if (options.dryRun) {
      results.push({ workspace_id: row.id, status: 'dry_run' });
      continue;
    }
    const ctx = await systemContext(row.id, null);
    if (!ctx) continue;
    try {
      const { data: staff } = await admin.from('workspace_members').select('user_id').eq('workspace_id', row.id).in('role', ['owner', 'admin']);
      const emails: string[] = [];
      for (const m of (staff ?? []) as { user_id: string }[]) {
        const email = (await admin.auth.admin.getUserById(m.user_id)).data.user?.email;
        if (email) emails.push(email);
      }
      const message = buildWeeklyReport(await weeklyReportData(ctx, options.appUrl, options.now));
      for (const to of emails) await deliver(ctx, to, message);
      // Guardado logo a seguir ao envio (lido de novo: não apaga o que outra tarefa mudou entretanto).
      const { data: fresh } = await admin.from('workspaces').select('settings').eq('id', row.id).maybeSingle();
      const current = (fresh?.settings ?? {}) as Record<string, unknown>;
      await admin
        .from('workspaces')
        .update({ settings: { ...current, weekly_report: { ...report, last_sent_at: new Date().toISOString() } } })
        .eq('id', row.id);
      results.push({ workspace_id: row.id, status: 'sent', sent_to: emails.length });
      await resolveProblem(row.id, 'weekly_report', 'weekly');
    } catch (e) {
      const message = e instanceof ApiError ? (e.detail ?? e.title) : 'Erro inesperado.';
      results.push({ workspace_id: row.id, status: 'error', error: message });
      await reportProblem(row.id, { area: 'weekly_report', key: 'weekly', title: 'O resumo da semana não foi enviado', detail: message });
    }
  }
  return results;
}
