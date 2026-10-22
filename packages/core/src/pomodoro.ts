/**
 * Pomodoro nos projetos: blocos de trabalho (25 min) com pausas (5 min e, a
 * cada 4, uma de 15). Cada bloco de trabalho fica no registo de horas do
 * projeto, com a tarefa escolhida.
 */
import { z } from 'zod';

export const POMODORO_PHASES = ['work', 'short_break', 'long_break', 'ready'] as const;
export type PomodoroPhase = (typeof POMODORO_PHASES)[number];

export const POMODORO_PHASE_LABELS: Record<PomodoroPhase, string> = {
  work: 'A trabalhar',
  short_break: 'Pausa',
  long_break: 'Pausa longa',
  ready: 'Pausa terminada',
};

/** Sons do aviso (um só toque, gerado no browser). */
export const POMODORO_SOUNDS = ['sino', 'taca', 'madeira', 'digital', 'gota', 'marimba'] as const;
export type PomodoroSound = (typeof POMODORO_SOUNDS)[number];
export const POMODORO_SOUND_LABELS: Record<PomodoroSound, string> = {
  sino: 'Sino',
  taca: 'Taça tibetana',
  madeira: 'Madeira',
  digital: 'Digital',
  gota: 'Gota',
  marimba: 'Marimba',
};

const minutes = (max: number, error: string) => z.int({ error }).min(1, { error: 'Mínimo 1 minuto.' }).max(max, { error: `Máximo ${max} minutos.` });

export const PomodoroSettingsSchema = z.object({
  work_minutes: minutes(180, 'Indica os minutos de trabalho.').default(25),
  short_break_minutes: minutes(60, 'Indica os minutos da pausa.').default(5),
  long_break_minutes: minutes(120, 'Indica os minutos da pausa longa.').default(15),
  /** Pausa longa a cada N pomodoros. */
  long_every: z.int().min(2, { error: 'Mínimo 2.' }).max(12, { error: 'Máximo 12.' }).default(4),
  /** Som no fim de cada fase (com a app aberta). */
  sound: z.boolean().default(true),
  /** Qual o som (um só toque). */
  sound_name: z.enum(POMODORO_SOUNDS).default('sino'),
  /** A pausa começa sozinha quando o trabalho acaba (false = fica à espera de "Começar pausa"). */
  auto_start_break: z.boolean().default(true),
});
export type PomodoroSettings = z.output<typeof PomodoroSettingsSchema>;
export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  work_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  long_every: 4,
  sound: true,
  sound_name: 'sino',
  auto_start_break: true,
};

export const PomodoroSchema = z
  .object({
    lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), project_title: z.string().nullable() }),
    task: z.object({ id: z.uuid(), title: z.string() }).nullable(),
    phase: z.enum(POMODORO_PHASES),
    phase_started_at: z.string(),
    ends_at: z.string().nullable().meta({ description: 'Quando acaba a fase (null em pausa ou à espera do próximo)' }),
    paused_left: z.int().nullable().meta({ description: 'Segundos que faltavam quando se pausou' }),
    completed: z.int().meta({ description: 'Pomodoros completos neste ciclo' }),
    long_every: z.int(),
    today: z.int().meta({ description: 'Pomodoros completos hoje (todos os projetos)' }),
    server_now: z.string().meta({ description: 'Hora do servidor (para acertar o relógio)' }),
  })
  .nullable()
  .meta({ id: 'Pomodoro' });
export type Pomodoro = z.infer<typeof PomodoroSchema>;

export const PomodoroStartSchema = z
  .object({
    lead_id: z.uuid(),
    task_id: z.uuid().nullish().transform((v) => v ?? null),
    /** "short_break" = descanso forçado agora (o trabalho em curso fica registado, sem contar como pomodoro completo). */
    phase: z.enum(['work', 'short_break']).optional().default('work'),
  })
  .meta({ id: 'PomodoroStart' });
export type PomodoroStart = z.output<typeof PomodoroStartSchema>;

export const POMODORO_ACTIONS = ['pause', 'resume', 'skip', 'restart', 'stop'] as const;
export const PomodoroActionSchema = z.object({ action: z.enum(POMODORO_ACTIONS) }).meta({ id: 'PomodoroAction' });
export type PomodoroAction = z.output<typeof PomodoroActionSchema>['action'];

export const PomodoroStatsSchema = z
  .object({
    today: z.int(),
    week: z.int().meta({ description: 'Últimos 7 dias' }),
    minutes_week: z.int(),
    days: z.array(z.object({ date: z.string(), count: z.int() })).meta({ description: 'Últimos 14 dias' }),
    by_project: z.array(
      z.object({
        lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), project_title: z.string().nullable() }),
        count: z.int(),
        minutes: z.int(),
      }),
    ),
  })
  .meta({ id: 'PomodoroStats' });
export type PomodoroStats = z.infer<typeof PomodoroStatsSchema>;

/** Duração (minutos) de uma fase. "ready" não tem duração. */
export function phaseMinutes(phase: PomodoroPhase, settings: PomodoroSettings): number {
  if (phase === 'work') return settings.work_minutes;
  if (phase === 'short_break') return settings.short_break_minutes;
  if (phase === 'long_break') return settings.long_break_minutes;
  return 0;
}

/**
 * Fase seguinte: depois do trabalho vem a pausa (longa a cada `long_every`
 * pomodoros); depois da pausa fica à espera do próximo ("ready").
 */
export function nextPomodoroPhase(phase: PomodoroPhase, completed: number, settings: PomodoroSettings): { phase: PomodoroPhase; completed: number } {
  if (phase === 'work') {
    const done = completed + 1;
    return { phase: done % settings.long_every === 0 ? 'long_break' : 'short_break', completed: done };
  }
  if (phase === 'long_break') return { phase: 'ready', completed: 0 };
  return { phase: 'ready', completed };
}

/** Segundos que faltam na fase (em pausa: o que faltava). */
export function pomodoroRemaining(p: { ends_at: string | null; paused_left: number | null }, now: number = Date.now()): number {
  if (p.paused_left !== null) return p.paused_left;
  if (!p.ends_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(p.ends_at) - now) / 1000));
}

/** 1500 → "25:00"; 65 → "01:05". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Texto da notificação no fim de uma fase (a fase nova). */
export function pomodoroNotice(phase: PomodoroPhase, settings: PomodoroSettings, company: string): { title: string; body: string } {
  const later = settings.auto_start_break ? '' : ' quando quiseres (Começar pausa)';
  if (phase === 'short_break') return { title: 'Pomodoro terminado', body: `${company}: pausa de ${settings.short_break_minutes} minutos${later}.` };
  if (phase === 'long_break') return { title: 'Pomodoro terminado', body: `${company}: pausa longa de ${settings.long_break_minutes} minutos${later}.` };
  if (phase === 'ready') return { title: 'Pausa terminada', body: `Volta ao trabalho: ${company}.` };
  return { title: 'Pomodoro', body: `A trabalhar: ${company}.` };
}
