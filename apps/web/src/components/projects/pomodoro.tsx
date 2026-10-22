'use client';

/**
 * Pomodoro: blocos de trabalho com pausas, no registo de horas do projeto.
 * - PomodoroBox: no cartão do projeto (Projetos e ficha).
 * - PomodoroIndicator: sempre à vista no menu (no lugar do temporizador).
 * - PomodoroWatcher: avisa (som e notificação) quando uma fase acaba.
 */
import {
  POMODORO_PHASE_LABELS,
  formatCountdown,
  leadPath,
  pomodoroNotice,
  pomodoroRemaining,
  type Lead,
  type Pomodoro,
  type PomodoroAction,
  type PomodoroSettings,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Coffee, Pause, Play, SkipForward, Square } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useLeadTasks, usePomodoro, usePomodoroAction, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Pomodoro ligado (precisa dos projetos e do registo de horas). */
export function usePomodoroSettings(): PomodoroSettings | null {
  const { data: settings } = useSettings();
  if (!settings?.features.projects || !settings.features.time_tracking || !settings.features.pomodoro) return null;
  return settings.pomodoro;
}

/** Segundos que faltam, a atualizar de segundo a segundo. */
export function usePomodoroClock(p: Pomodoro): number {
  const [now, setNow] = useState(() => Date.now());
  const ticking = !!p?.ends_at;
  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    // Acerta logo (a página pode estar aberta há muito tempo) e depois de segundo a segundo.
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [ticking, p?.ends_at]);
  return p ? pomodoroRemaining(p, now) : 0;
}

function Dots({ completed, every, className }: { completed: number; every: number; className?: string }) {
  const done = completed % every || (completed > 0 ? every : 0);
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label={`${done} de ${every} pomodoros neste ciclo`} role="img">
      {Array.from({ length: every }, (_, i) => (
        <span key={i} className={cn('h-2 w-2 rounded-full', i < done ? 'bg-accent' : 'bg-surface-3')} />
      ))}
    </span>
  );
}

function useRun() {
  const action = usePomodoroAction();
  return {
    pending: action.isPending,
    async run(input: Parameters<typeof action.mutateAsync>[0], success?: string) {
      try {
        await action.mutateAsync(input);
        if (success) toast.success(success);
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
  };
}

/** Pede autorização para as notificações (no clique, que é quando o browser deixa). */
function askNotifications() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
}

export function PomodoroBox({ lead, className }: { lead: Lead; className?: string }) {
  const settings = usePomodoroSettings();
  const { data: pomodoro } = usePomodoro(!!settings);
  const { data: tasks } = useLeadTasks(lead.id);
  const [taskId, setTaskId] = useState('');
  const remaining = usePomodoroClock(pomodoro ?? null);
  const { run, pending } = useRun();
  if (!settings) return null;

  const here = pomodoro?.lead.id === lead.id ? pomodoro : null;
  const elsewhere = pomodoro && !here ? pomodoro : null;
  const open = (tasks ?? []).filter((t) => !t.done_at);
  const start = () => {
    askNotifications();
    void run({ start: { lead_id: lead.id, task_id: taskId || null } }, `Pomodoro de ${settings.work_minutes} minutos a contar.`);
  };
  const act = (action: PomodoroAction, success?: string) => void run({ action }, success);
  const paused = here?.paused_left !== null && here?.paused_left !== undefined;
  const onBreak = here?.phase === 'short_break' || here?.phase === 'long_break';

  return (
    <section aria-label="Pomodoro" className={cn('flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3', here?.phase === 'work' && !paused && 'border-accent bg-accent-soft/40', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">🍅 Pomodoro</span>
        {here ? <Dots completed={here.completed} every={here.long_every} /> : null}
      </div>

      {here ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className={cn('text-xs font-medium', onBreak ? 'text-success' : here.phase === 'ready' ? 'text-warning' : 'text-accent-text')}>
                {paused ? 'Em pausa' : POMODORO_PHASE_LABELS[here.phase]}
                {here.task ? <span className="font-normal text-muted"> · {here.task.title}</span> : null}
              </p>
              <p className="font-display text-3xl font-semibold tabular" role="timer" aria-live="off" aria-label="Tempo que falta">
                {here.phase === 'ready' ? formatCountdown(settings.work_minutes * 60) : formatCountdown(remaining)}
              </p>
            </div>
            <p className="text-xs text-muted">Hoje: {here.today} 🍅</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {here.phase === 'ready' ? (
              <Button size="sm" onClick={start} loading={pending}>
                <Play className="h-3.5 w-3.5" aria-hidden /> Começar o próximo
              </Button>
            ) : paused ? (
              <Button size="sm" onClick={() => act('resume')} loading={pending}>
                <Play className="h-3.5 w-3.5" aria-hidden /> Continuar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => act('pause')} loading={pending}>
                <Pause className="h-3.5 w-3.5" aria-hidden /> Pausar
              </Button>
            )}
            {onBreak ? (
              <Button size="sm" variant="outline" onClick={() => act('skip')} disabled={pending}>
                <SkipForward className="h-3.5 w-3.5" aria-hidden /> Saltar pausa
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => act('stop', 'Pomodoro parado. O tempo de trabalho ficou registado.')} disabled={pending}>
              <Square className="h-3.5 w-3.5" aria-hidden /> Parar
            </Button>
          </div>
        </>
      ) : (
        <>
          {elsewhere ? (
            <p className="text-xs text-muted">
              A decorrer em{' '}
              <Link href={`${leadPath(elsewhere.lead)}#projeto`} className="font-medium text-accent-text hover:underline">
                {elsewhere.lead.company_name}
              </Link>
              . Começar aqui passa o pomodoro para este projeto.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {open.length ? (
              <Select aria-label="Em que tarefa?" value={taskId} onChange={(e) => setTaskId(e.target.value)} className="h-9 min-w-0 flex-[1_1_10rem] text-sm">
                <option value="">Em que tarefa? (opcional)</option>
                {open.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title.length > 60 ? `${t.title.slice(0, 60)}…` : t.title}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button size="sm" onClick={start} loading={pending} className="ml-auto shrink-0">
              <Play className="h-3.5 w-3.5" aria-hidden /> Começar {settings.work_minutes} min
            </Button>
          </div>
          <p className="text-xs text-muted">
            {settings.work_minutes} min de trabalho, {settings.short_break_minutes} de pausa; a cada {settings.long_every}, pausa de {settings.long_break_minutes}. O trabalho fica nas horas do
            projeto.
          </p>
        </>
      )}
    </section>
  );
}

/** No menu (no lugar do temporizador): a fase, o tempo que falta e pausar/continuar. */
export function PomodoroIndicator({ pomodoro, compact, className }: { pomodoro: NonNullable<Pomodoro>; compact?: boolean; className?: string }) {
  const remaining = usePomodoroClock(pomodoro);
  const { run, pending } = useRun();
  const paused = pomodoro.paused_left !== null;
  const onBreak = pomodoro.phase === 'short_break' || pomodoro.phase === 'long_break';
  const label = paused ? 'Em pausa' : POMODORO_PHASE_LABELS[pomodoro.phase];
  const clock = pomodoro.phase === 'ready' ? '—' : formatCountdown(remaining);
  return (
    <div
      role="status"
      aria-label={`Pomodoro: ${label}, ${pomodoro.lead.company_name}, faltam ${clock}`}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm',
        onBreak ? 'border-success bg-success-soft' : 'border-accent bg-accent-soft',
        className,
      )}
    >
      <span aria-hidden>{onBreak ? <Coffee className="h-4 w-4 text-success" /> : '🍅'}</span>
      <span className="min-w-0 flex-1 leading-tight">
        {!compact ? (
          <Link href={`${leadPath(pomodoro.lead)}#projeto`} className="block truncate text-xs text-muted hover:text-fg hover:underline">
            {label} · {pomodoro.lead.company_name}
          </Link>
        ) : null}
        <span className={cn('font-semibold tabular', onBreak ? 'text-success' : 'text-accent-text')}>{clock}</span>
      </span>
      {pomodoro.phase === 'ready' ? (
        <button
          type="button"
          onClick={() => void run({ start: { lead_id: pomodoro.lead.id, task_id: pomodoro.task?.id ?? null } })}
          disabled={pending}
          className="rounded-md p-1.5 text-accent-text hover:bg-accent-soft disabled:opacity-50 pointer-coarse:p-2"
          aria-label="Começar o próximo pomodoro"
          title="Começar o próximo"
        >
          <Play className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void run({ action: paused ? 'resume' : 'pause' })}
          disabled={pending}
          className="rounded-md p-1.5 text-accent-text hover:bg-accent-soft disabled:opacity-50 pointer-coarse:p-2"
          aria-label={paused ? 'Continuar o pomodoro' : 'Pausar o pomodoro'}
          title={paused ? 'Continuar' : 'Pausar'}
        >
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}

/** Três toques curtos (sem ficheiros de som). */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  } catch {
    // Sem som: fica o aviso no ecrã.
  }
}

async function systemNotification(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // No telemóvel (Android) só funciona pelo service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag: 'pomodoro', icon: '/icons/icon-192.png' });
    else new Notification(title, { body, tag: 'pomodoro' });
  } catch {
    // Sem notificação: fica o aviso no ecrã.
  }
}

/**
 * Montado uma vez (na app): quando a fase acaba, pede o estado ao servidor (que
 * avança e regista as horas) e avisa com som, notificação e mensagem.
 */
export function PomodoroWatcher() {
  const settings = usePomodoroSettings();
  const { data: pomodoro } = usePomodoro(!!settings);
  const remaining = usePomodoroClock(pomodoro ?? null);
  const qc = useQueryClient();
  const waiting = useRef<string | null>(null);
  const due = !!pomodoro?.ends_at && pomodoro.paused_left === null && remaining <= 0;
  const key = pomodoro ? `${pomodoro.phase}:${pomodoro.phase_started_at}` : null;

  useEffect(() => {
    if (!due || !key || waiting.current === key) return;
    waiting.current = key;
    void qc.invalidateQueries({ queryKey: ['pomodoro'] });
    void qc.invalidateQueries({ queryKey: ['time'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  }, [due, key, qc]);

  useEffect(() => {
    // A fase mudou depois de acabar o tempo: avisa.
    if (!waiting.current || !pomodoro || !settings || key === waiting.current) return;
    waiting.current = null;
    const notice = pomodoroNotice(pomodoro.phase, settings, pomodoro.lead.company_name);
    if (settings.sound) beep();
    navigator.vibrate?.([200, 100, 200]);
    void systemNotification(notice.title, notice.body);
    toast(notice.title, { description: notice.body, duration: 10_000 });
  }, [key, pomodoro, settings]);

  return null;
}
