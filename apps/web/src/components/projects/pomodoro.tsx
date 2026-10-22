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
  phaseMinutes,
  pomodoroNotice,
  pomodoroRemaining,
  type Lead,
  type Pomodoro,
  type PomodoroAction,
  type PomodoroSettings,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Coffee, Pause, Play, RotateCcw, SkipForward, Square, Timer } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { playChime, unlockSound } from '@/lib/pomodoro-sound';
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
      unlockSound();
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

/**
 * Mostrador circular com 60 marcas: as que já passaram ficam apagadas e o
 * ponteiro (laranja a trabalhar, verde na pausa) mostra onde vai a fase.
 */
function Dial({ fraction, tone, children }: { fraction: number; tone: 'accent' | 'success' | 'muted'; children: React.ReactNode }) {
  const f = Math.min(1, Math.max(0, fraction));
  const angle = f * 360;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[13.5rem]">
      <svg viewBox="-100 -100 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          const passed = i / 60 < f;
          return (
            <line
              key={i}
              x1={Math.sin(a) * 84}
              y1={-Math.cos(a) * 84}
              x2={Math.sin(a) * 94}
              y2={-Math.cos(a) * 94}
              strokeWidth={3.2}
              strokeLinecap="round"
              className={passed ? 'stroke-fg/10' : 'stroke-fg/35'}
            />
          );
        })}
        <line
          x1={0}
          y1={-74}
          x2={0}
          y2={-97}
          strokeWidth={4.5}
          strokeLinecap="round"
          transform={`rotate(${angle})`}
          className={cn('transition-transform duration-1000 ease-linear motion-reduce:transition-none', tone === 'success' ? 'stroke-success' : tone === 'accent' ? 'stroke-accent' : 'stroke-fg/50')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-8 text-center">{children}</div>
    </div>
  );
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
  const start = (phase: 'work' | 'short_break' = 'work') => {
    askNotifications();
    void run(
      { start: { lead_id: lead.id, task_id: taskId || here?.task?.id || null, phase } },
      phase === 'work' ? `Pomodoro de ${settings.work_minutes} minutos a contar.` : `Pausa de ${settings.short_break_minutes} minutos.`,
    );
  };
  const act = (action: PomodoroAction, success?: string) => void run({ action }, success);
  const paused = !!here && here.paused_left !== null;
  const onBreak = here?.phase === 'short_break' || here?.phase === 'long_break';
  const working = here?.phase === 'work';
  const total = here && here.phase !== 'ready' ? phaseMinutes(here.phase, settings) * 60 : settings.work_minutes * 60;
  const left = here && here.phase !== 'ready' ? Math.min(remaining, total) : total;
  // Pausa por começar (com "Começar a pausa automaticamente" desligado).
  const breakWaiting = onBreak && paused && here.paused_left! >= total;
  const label = !here ? 'Pronto' : breakWaiting ? 'Pausa por começar' : paused ? 'Em pausa' : POMODORO_PHASE_LABELS[here.phase];
  const breakButton = (
    <Button size="sm" variant="outline" onClick={() => start('short_break')} disabled={pending}>
      <Coffee className="h-3.5 w-3.5" aria-hidden /> Pausa de {settings.short_break_minutes} min
    </Button>
  );

  return (
    <section
      aria-label="Pomodoro"
      className={cn('flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3', working && !paused && 'border-accent', onBreak && !paused && 'border-success', className)}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted">
          <Timer className="h-3.5 w-3.5" aria-hidden /> Pomodoro
        </span>
        <span className="inline-flex items-center gap-3 text-muted">
          {here ? <Dots completed={here.completed} every={here.long_every} /> : null}
          {here ? (
            <span className="inline-flex items-center gap-1" title="Pomodoros completos hoje">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Hoje: {here.today}
            </span>
          ) : null}
        </span>
      </div>

      <Dial fraction={1 - left / total} tone={!here || paused || here.phase === 'ready' ? 'muted' : onBreak ? 'success' : 'accent'}>
        <span className={cn('text-xs font-medium', onBreak ? 'text-success' : here?.phase === 'ready' ? 'text-warning' : here ? 'text-accent-text' : 'text-muted')}>{label}</span>
        <span className="text-5xl font-extralight tabular tracking-tight" role="timer" aria-live="off" aria-label="Tempo que falta">
          {formatCountdown(left)}
        </span>
        {here?.task ? <span className="line-clamp-2 text-xs text-muted">{here.task.title}</span> : null}
      </Dial>

      {here ? (
        <div className="flex flex-wrap justify-center gap-2">
          {here.phase === 'ready' ? (
            <>
              <Button size="sm" onClick={() => start('work')} loading={pending}>
                <Play className="h-3.5 w-3.5" aria-hidden /> Começar o próximo
              </Button>
              {breakButton}
            </>
          ) : breakWaiting ? (
            <>
              <Button size="sm" onClick={() => act('resume')} loading={pending}>
                <Coffee className="h-3.5 w-3.5" aria-hidden /> Começar pausa
              </Button>
              <Button size="sm" variant="outline" onClick={() => act('skip')} disabled={pending}>
                <SkipForward className="h-3.5 w-3.5" aria-hidden /> Saltar pausa
              </Button>
            </>
          ) : paused ? (
            <>
              <Button size="sm" onClick={() => act('resume')} loading={pending}>
                <Play className="h-3.5 w-3.5" aria-hidden /> Continuar
              </Button>
              <Button size="sm" variant="outline" onClick={() => act('restart', 'A fase recomeçou do início.')} disabled={pending}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reiniciar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => act('pause')} loading={pending}>
                <Pause className="h-3.5 w-3.5" aria-hidden /> Pausar
              </Button>
              {onBreak ? (
                <Button size="sm" variant="outline" onClick={() => act('skip')} disabled={pending}>
                  <SkipForward className="h-3.5 w-3.5" aria-hidden /> Saltar pausa
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => act('restart', 'O pomodoro recomeçou do início.')} disabled={pending}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reiniciar
                  </Button>
                  {breakButton}
                </>
              )}
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => act('stop', 'Pomodoro parado. O tempo de trabalho ficou registado.')} disabled={pending}>
            <Square className="h-3.5 w-3.5" aria-hidden /> Parar
          </Button>
        </div>
      ) : (
        <>
          {elsewhere ? (
            <p className="text-center text-xs text-muted">
              A decorrer em{' '}
              <Link href={`${leadPath(elsewhere.lead)}#projeto`} className="font-medium text-accent-text hover:underline">
                {elsewhere.lead.company_name}
              </Link>
              . Começar aqui passa o pomodoro para este projeto.
            </p>
          ) : null}
          {open.length ? (
            <Select aria-label="Em que tarefa?" value={taskId} onChange={(e) => setTaskId(e.target.value)} className="h-9 text-sm">
              <option value="">Em que tarefa? (opcional)</option>
              {open.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title.length > 60 ? `${t.title.slice(0, 60)}…` : t.title}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => start('work')} loading={pending}>
              <Play className="h-3.5 w-3.5" aria-hidden /> Começar {settings.work_minutes} min
            </Button>
            {breakButton}
          </div>
          <p className="text-center text-xs text-muted">
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
      {onBreak ? <Coffee className="h-4 w-4 shrink-0 text-success" aria-hidden /> : <Timer className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />}
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

async function systemNotification(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // No telemóvel (Android) só funciona pelo service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    // Com som do sistema e a ficar à vista até ser vista (o telemóvel avisa mesmo com o ecrã noutra app).
    const options: NotificationOptions = { body, tag: 'pomodoro', silent: false, requireInteraction: true };
    if (reg) await reg.showNotification(title, { ...options, icon: '/icons/icon-192.png' });
    else new Notification(title, options);
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

  // O som só pode tocar depois de um clique: autoriza-o no primeiro clique/tecla na app.
  useEffect(() => {
    if (!settings?.sound) return;
    const unlock = () => unlockSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [settings?.sound]);

  useEffect(() => {
    if (!due || !key || waiting.current === key) return;
    waiting.current = key;
    // O som toca logo, no segundo em que o tempo acaba (o resto vem com a resposta do servidor).
    if (settings?.sound) playChime(settings.sound_name);
    void qc.invalidateQueries({ queryKey: ['pomodoro'] });
    void qc.invalidateQueries({ queryKey: ['time'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  }, [due, key, qc, settings?.sound, settings?.sound_name]);

  useEffect(() => {
    // A fase mudou depois de acabar o tempo: avisa.
    if (!waiting.current || !pomodoro || !settings || key === waiting.current) return;
    waiting.current = null;
    const notice = pomodoroNotice(pomodoro.phase, settings, pomodoro.lead.company_name);
    navigator.vibrate?.([200, 100, 200]);
    void systemNotification(notice.title, notice.body);
    toast(notice.title, { description: notice.body, duration: 10_000 });
  }, [key, pomodoro, settings]);

  return null;
}
