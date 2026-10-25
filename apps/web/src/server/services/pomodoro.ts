/**
 * Pomodoro: o trabalho conta no registo de horas do projeto (como o
 * temporizador ▶), as pausas não. As fases avançam no servidor: ao abrir a app
 * (GET /pomodoro, sem notificação — a app já avisa) ou pelo cron dos lembretes
 * (com notificação push), por isso nada se perde com a app fechada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WorkspaceSettingsSchema,
  addDays,
  nextPomodoroPhase,
  phaseMinutes,
  pomodoroNotice,
  pomodoroRemaining,
  todayIso,
  type Pomodoro,
  type PomodoroAction,
  type PomodoroPhase,
  type PomodoroSettings,
  type PomodoroStart,
  type PomodoroStats,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead } from './leads';
import { stopTimer } from './project-tools';
import { sendUserPush } from './push';
import { getSettings } from './workspace';

type Db = SupabaseClient;
type LeadRef = { id: string; number: number; company_name: string; project_title: string | null };

interface TimerRow {
  user_id: string;
  workspace_id: string;
  lead_id: string;
  task_id: string | null;
  phase: PomodoroPhase;
  phase_started_at: string;
  ends_at: string | null;
  paused_left: number | null;
  completed: number;
  entry_id: string | null;
  notified_at: string | null;
  updated_at: string;
  lead: LeadRef;
  task: { id: string; title: string } | null;
}

const ROW_SELECT =
  'user_id, workspace_id, lead_id, task_id, phase, phase_started_at, ends_at, paused_left, completed, entry_id, notified_at, updated_at, lead:leads!inner(id, number, company_name, project_title), task:lead_tasks(id, title)';
const at = (ms: number) => new Date(ms).toISOString();
const entryNotes = (task: { title: string } | null) => (task ? `Pomodoro · ${task.title}` : 'Pomodoro').slice(0, 300);

async function loadRow(db: Db, workspaceId: string, userId: string): Promise<TimerRow | null> {
  const { data, error } = await db.from('pomodoro_timers').select(ROW_SELECT).eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (error) throw fromPostgrest(error);
  return data as unknown as TimerRow | null;
}

type RowPatch = Partial<Omit<TimerRow, 'lead' | 'task' | 'user_id' | 'workspace_id'>>;

/**
 * Atualiza só se ninguém mexeu entretanto (a app e o cron podem avançar ao
 * mesmo tempo). Devolve o novo updated_at (null = outro pedido mudou primeiro).
 */
async function saveRow(db: Db, row: TimerRow, patch: RowPatch): Promise<string | null> {
  const updatedAt = new Date().toISOString();
  const { data, error } = await db
    .from('pomodoro_timers')
    .update({ ...patch, updated_at: updatedAt })
    .eq('user_id', row.user_id)
    .eq('updated_at', row.updated_at)
    .select('user_id');
  if (error) throw fromPostgrest(error);
  return data?.length ? updatedAt : null;
}

/**
 * Avança as fases que já acabaram. Trabalho → fecha o registo de horas na hora
 * certa (marcado como pomodoro completo) e começa a pausa; pausa → à espera do
 * próximo. Devolve a fase final e se mudou.
 */
async function advance(db: Db, row: TimerRow, settings: PomodoroSettings, now: number, notified: boolean): Promise<{ row: TimerRow; changed: boolean }> {
  let phase = row.phase;
  let completed = row.completed;
  let endsAt = row.ends_at;
  let startedAt = row.phase_started_at;
  let entryId = row.entry_id;
  let pausedLeft = row.paused_left;
  let changed = false;
  while (endsAt && pausedLeft === null && Date.parse(endsAt) <= now) {
    if (phase === 'work' && entryId) {
      const { data: entry } = await db.from('project_time_entries').select('started_at').eq('id', entryId).is('ended_at', null).maybeSingle();
      if (entry) {
        // Nunca antes do início do registo (relógios acertados, por exemplo).
        const started = (entry as { started_at: string }).started_at;
        const { error } = await db
          .from('project_time_entries')
          .update({ ended_at: Date.parse(endsAt) < Date.parse(started) ? started : endsAt, pomodoro_done: true })
          .eq('id', entryId)
          .is('ended_at', null);
        if (error) throw fromPostgrest(error);
      }
      entryId = null;
    }
    const next = nextPomodoroPhase(phase, completed, settings);
    const minutes = phaseMinutes(next.phase, settings);
    startedAt = endsAt;
    if (phase === 'work' && !settings.auto_start_break) {
      // A pausa fica à espera de "Começar pausa".
      endsAt = null;
      pausedLeft = minutes * 60;
    } else {
      endsAt = minutes ? at(Date.parse(endsAt) + minutes * 60_000) : null;
    }
    phase = next.phase;
    completed = next.completed;
    changed = true;
  }
  if (!changed) return { row, changed };
  const patch: RowPatch = { phase, completed, ends_at: endsAt, paused_left: pausedLeft, phase_started_at: startedAt, entry_id: entryId, notified_at: notified ? at(now) : null };
  const updatedAt = await saveRow(db, row, patch);
  if (!updatedAt) {
    // Outro pedido avançou primeiro: fica o estado dele.
    const fresh = await loadRow(db, row.workspace_id, row.user_id);
    return { row: fresh ?? row, changed: false };
  }
  return { row: { ...row, ...patch, updated_at: updatedAt }, changed };
}

async function todayCount(ctx: ApiContext): Promise<number> {
  const since = at(Date.now() - 36 * 3_600_000);
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .select('started_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .eq('pomodoro_done', true)
    .gte('started_at', since);
  if (error) throw fromPostgrest(error);
  const today = todayIso();
  return ((data ?? []) as { started_at: string }[]).filter((e) => todayIso(new Date(e.started_at)) === today).length;
}

async function toPomodoro(ctx: ApiContext, row: TimerRow | null, settings: PomodoroSettings): Promise<Pomodoro> {
  if (!row) return null;
  return {
    lead: row.lead,
    task: row.task,
    phase: row.phase,
    phase_started_at: row.phase_started_at,
    ends_at: row.ends_at,
    paused_left: row.paused_left,
    completed: row.completed,
    long_every: settings.long_every,
    today: await todayCount(ctx),
    server_now: new Date().toISOString(),
  };
}

async function settingsOf(ctx: ApiContext): Promise<PomodoroSettings> {
  return (await getSettings(ctx)).pomodoro;
}

/** O pomodoro em curso (avança as fases que já acabaram; quem abre a app já é avisado por ela). */
export async function getPomodoro(ctx: ApiContext): Promise<Pomodoro> {
  const settings = await settingsOf(ctx);
  const row = await loadRow(ctx.supabase, ctx.workspaceId, ctx.user.id);
  if (!row) return null;
  const { row: current } = await advance(ctx.supabase, row, settings, Date.now(), true);
  return toPomodoro(ctx, current, settings);
}

async function insertWorkEntry(ctx: ApiContext, leadId: string, task: { id: string; title: string } | null): Promise<string> {
  // Só um temporizador a contar: fecha o que estiver (noutro projeto, por exemplo).
  await stopTimer(ctx);
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      user_id: ctx.user.id,
      started_at: new Date().toISOString(),
      notes: entryNotes(task),
      pomodoro: true,
      task_id: task?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw fromPostgrest(error);
  return (data as { id: string }).id;
}

/**
 * Começa um pomodoro de trabalho no projeto (e na tarefa, se escolhida) ou,
 * com phase "short_break", um descanso já. O ciclo continua.
 */
export async function startPomodoro(ctx: ApiContext, input: PomodoroStart): Promise<Pomodoro> {
  const settings = await settingsOf(ctx);
  const lead = await getLead(ctx, input.lead_id);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível registar horas num lead anonimizado.');
  let task: { id: string; title: string } | null = null;
  if (input.task_id) {
    const { data, error } = await ctx.supabase
      .from('lead_tasks')
      .select('id, title')
      .eq('workspace_id', ctx.workspaceId)
      .eq('lead_id', lead.id)
      .eq('id', input.task_id)
      .maybeSingle();
    if (error) throw fromPostgrest(error);
    if (!data) throw new ApiError(404, 'Tarefa não encontrada', 'A tarefa não é deste projeto.');
    task = data as { id: string; title: string };
  }
  const previous = await loadRow(ctx.supabase, ctx.workspaceId, ctx.user.id);
  const work = input.phase === 'work';
  // Descanso forçado: o trabalho em curso fica registado (sem contar como pomodoro completo).
  const entryId = work ? await insertWorkEntry(ctx, lead.id, task) : (await stopTimer(ctx), null);
  const now = Date.now();
  const { error } = await ctx.supabase.from('pomodoro_timers').upsert(
    {
      user_id: ctx.user.id,
      workspace_id: ctx.workspaceId,
      lead_id: lead.id,
      task_id: task?.id ?? null,
      phase: input.phase,
      phase_started_at: at(now),
      ends_at: at(now + (work ? settings.work_minutes : settings.short_break_minutes) * 60_000),
      paused_left: null,
      // O ciclo continua (depois da pausa longa já voltou a 0).
      completed: previous?.completed ?? 0,
      entry_id: entryId,
      notified_at: null,
      updated_at: at(now),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw fromPostgrest(error);
  return getPomodoro(ctx);
}

/** Pausar, continuar, saltar (acabar já a fase), reiniciar a fase ou parar o pomodoro. */
export async function pomodoroAction(ctx: ApiContext, action: PomodoroAction): Promise<Pomodoro> {
  const settings = await settingsOf(ctx);
  let row = await loadRow(ctx.supabase, ctx.workspaceId, ctx.user.id);
  if (!row) throw new ApiError(404, 'Sem pomodoro', 'Não há nenhum pomodoro a decorrer.');
  row = (await advance(ctx.supabase, row, settings, Date.now(), true)).row;
  const now = Date.now();

  if (action === 'stop') {
    if (row.phase === 'work' && row.entry_id) await stopTimer(ctx);
    const { error } = await ctx.supabase.from('pomodoro_timers').delete().eq('user_id', ctx.user.id);
    if (error) throw fromPostgrest(error);
    return null;
  }
  if (action === 'pause') {
    if (row.phase === 'ready' || row.paused_left !== null) return getPomodoro(ctx);
    if (row.phase === 'work') await stopTimer(ctx);
    await saveRow(ctx.supabase, row, { paused_left: pomodoroRemaining(row, now), ends_at: null, entry_id: null });
    return getPomodoro(ctx);
  }
  if (action === 'restart') {
    // A fase volta ao início (o trabalho já feito fica registado) e conta logo.
    const minutes = phaseMinutes(row.phase, settings);
    if (!minutes) return getPomodoro(ctx);
    const entryId = row.phase === 'work' ? await insertWorkEntry(ctx, row.lead_id, row.task) : null;
    await saveRow(ctx.supabase, row, { phase_started_at: at(now), ends_at: at(now + minutes * 60_000), paused_left: null, entry_id: entryId, notified_at: null });
    return getPomodoro(ctx);
  }
  if (action === 'resume') {
    if (row.paused_left === null) return getPomodoro(ctx);
    const entryId = row.phase === 'work' ? await insertWorkEntry(ctx, row.lead_id, row.task) : null;
    await saveRow(ctx.supabase, row, { ends_at: at(now + row.paused_left * 1000), paused_left: null, entry_id: entryId });
    return getPomodoro(ctx);
  }
  // skip: a fase acaba agora (o trabalho conta como pomodoro completo).
  if (row.phase === 'ready') return getPomodoro(ctx);
  if (row.paused_left !== null && row.phase === 'work') {
    // Em pausa não há registo aberto: o pomodoro conta como feito no último registo.
    const { data } = await ctx.supabase
      .from('project_time_entries')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', ctx.user.id)
      .eq('pomodoro', true)
      .order('started_at', { ascending: false })
      .limit(1);
    const last = (data as { id: string }[] | null)?.[0];
    if (last) await ctx.supabase.from('project_time_entries').update({ pomodoro_done: true }).eq('id', last.id);
  }
  await saveRow(ctx.supabase, row, { ends_at: at(now), paused_left: null });
  return getPomodoro(ctx);
}

/** O temporizador ▶ foi pausado: um pomodoro de trabalho fica também em pausa. */
export async function pauseWorkPomodoro(ctx: ApiContext): Promise<void> {
  const row = await loadRow(ctx.supabase, ctx.workspaceId, ctx.user.id);
  if (!row || row.phase !== 'work' || row.paused_left !== null) return;
  await saveRow(ctx.supabase, row, { paused_left: pomodoroRemaining(row), ends_at: null, entry_id: null });
}

/** O temporizador ▶ começou à parte: o pomodoro termina (as horas passam a contar no temporizador). */
export async function clearPomodoro(ctx: ApiContext): Promise<void> {
  const { error } = await ctx.supabase.from('pomodoro_timers').delete().eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id);
  if (error) throw fromPostgrest(error);
}

/** Cron: avança os pomodoros que acabaram com a app fechada e envia a notificação. */
export async function advancePomodoros(options: { dryRun?: boolean; now?: Date } = {}): Promise<{ advanced: number; notified: number }> {
  const admin = createSupabaseAdminClient();
  const now = (options.now ?? new Date()).getTime();
  const { data, error } = await admin.from('pomodoro_timers').select(ROW_SELECT).lte('ends_at', at(now)).is('paused_left', null).limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as TimerRow[];
  if (options.dryRun) return { advanced: rows.length, notified: 0 };
  const settingsByWorkspace = new Map<string, PomodoroSettings>();
  let advanced = 0;
  let notified = 0;
  for (const row of rows) {
    let settings = settingsByWorkspace.get(row.workspace_id);
    if (!settings) {
      const { data: ws } = await admin.from('workspaces').select('settings').eq('id', row.workspace_id).maybeSingle();
      settings = WorkspaceSettingsSchema.parse((ws as { settings: unknown } | null)?.settings ?? {}).pomodoro;
      settingsByWorkspace.set(row.workspace_id, settings);
    }
    let result: Awaited<ReturnType<typeof advance>>;
    try {
      result = await advance(admin, row, settings, now, false);
    } catch (error) {
      // Um pomodoro com problemas não pára os outros (nem o resto do cron).
      console.error('[pomodoro] cron', row.user_id, error);
      continue;
    }
    if (!result.changed) continue;
    advanced++;
    const notice = pomodoroNotice(result.row.phase, settings, row.lead.company_name);
    try {
      const sent = await sendUserPush(row.workspace_id, row.user_id, { ...notice, url: '/projetos', tag: 'pomodoro' }, { ignoreQuiet: true });
      if (sent.sent) notified++;
    } catch {
      // Sem push configurado: a app avisa quando abrir.
    }
    await admin.from('pomodoro_timers').update({ notified_at: at(now) }).eq('user_id', row.user_id).is('notified_at', null);
  }
  return { advanced, notified };
}

/** Estatísticas: pomodoros por dia (14 dias) e por projeto. */
export async function pomodoroStats(ctx: ApiContext): Promise<PomodoroStats> {
  const today = todayIso();
  const first = addDays(today, -13);
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .select('started_at, ended_at, pomodoro_done, lead:leads!inner(id, number, company_name, project_title)')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .eq('pomodoro', true)
    .gte('started_at', at(Date.parse(`${first}T00:00:00Z`) - 2 * 3_600_000))
    .order('started_at', { ascending: true });
  if (error) throw fromPostgrest(error);
  const rows = ((data ?? []) as unknown as { started_at: string; ended_at: string | null; pomodoro_done: boolean; lead: LeadRef }[])
    .map((r) => ({ ...r, day: todayIso(new Date(r.started_at)), seconds: r.ended_at ? Math.max(0, (Date.parse(r.ended_at) - Date.parse(r.started_at)) / 1000) : 0 }))
    .filter((r) => r.day >= first);
  const weekStart = addDays(today, -6);
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(first, i);
    return { date, count: rows.filter((r) => r.day === date && r.pomodoro_done).length };
  });
  const projects = new Map<string, { lead: LeadRef; count: number; seconds: number }>();
  for (const r of rows) {
    const item = projects.get(r.lead.id) ?? { lead: r.lead, count: 0, seconds: 0 };
    if (r.pomodoro_done) item.count++;
    item.seconds += r.seconds;
    projects.set(r.lead.id, item);
  }
  const week = rows.filter((r) => r.day >= weekStart);
  return {
    today: rows.filter((r) => r.day === today && r.pomodoro_done).length,
    week: week.filter((r) => r.pomodoro_done).length,
    minutes_week: Math.round(week.reduce((s, r) => s + r.seconds, 0) / 60),
    days,
    by_project: [...projects.values()]
      .sort((a, b) => b.count - a.count || b.seconds - a.seconds)
      .slice(0, 8)
      .map((p) => ({ lead: p.lead, count: p.count, minutes: Math.round(p.seconds / 60) })),
  };
}
