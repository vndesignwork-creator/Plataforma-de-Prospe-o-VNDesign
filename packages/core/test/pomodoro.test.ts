import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POMODORO_SETTINGS,
  PomodoroSettingsSchema,
  WorkspaceSettingsSchema,
  formatCountdown,
  nextPomodoroPhase,
  phaseMinutes,
  pomodoroNotice,
  pomodoroRemaining,
} from '../src';

const s = DEFAULT_POMODORO_SETTINGS;

describe('pomodoro', () => {
  it('trabalho → pausa curta; ao 4.º → pausa longa; pausa → à espera', () => {
    expect(nextPomodoroPhase('work', 0, s)).toEqual({ phase: 'short_break', completed: 1 });
    expect(nextPomodoroPhase('work', 3, s)).toEqual({ phase: 'long_break', completed: 4 });
    expect(nextPomodoroPhase('short_break', 1, s)).toEqual({ phase: 'ready', completed: 1 });
    // Depois da pausa longa, o ciclo recomeça.
    expect(nextPomodoroPhase('long_break', 4, s)).toEqual({ phase: 'ready', completed: 0 });
    expect(nextPomodoroPhase('work', 1, { ...s, long_every: 2 }).phase).toBe('long_break');
  });

  it('durações de cada fase', () => {
    expect([phaseMinutes('work', s), phaseMinutes('short_break', s), phaseMinutes('long_break', s), phaseMinutes('ready', s)]).toEqual([25, 5, 15, 0]);
  });

  it('tempo que falta (a contar, em pausa, à espera)', () => {
    const now = Date.parse('2026-10-22T10:00:00Z');
    expect(pomodoroRemaining({ ends_at: '2026-10-22T10:25:00Z', paused_left: null }, now)).toBe(1500);
    expect(pomodoroRemaining({ ends_at: '2026-10-22T09:59:00Z', paused_left: null }, now)).toBe(0);
    expect(pomodoroRemaining({ ends_at: null, paused_left: 600 }, now)).toBe(600);
    expect(pomodoroRemaining({ ends_at: null, paused_left: null }, now)).toBe(0);
    expect(formatCountdown(1500)).toBe('25:00');
    expect(formatCountdown(65)).toBe('01:05');
  });

  it('avisos e definições', () => {
    expect(pomodoroNotice('short_break', s, 'Padaria Sol')).toEqual({ title: 'Pomodoro terminado', body: 'Padaria Sol: pausa de 5 minutos.' });
    expect(pomodoroNotice('ready', s, 'Padaria Sol').title).toBe('Pausa terminada');
    expect(pomodoroNotice('short_break', { ...s, auto_start_break: false }, 'Padaria Sol').body).toBe('Padaria Sol: pausa de 5 minutos quando quiseres (Começar pausa).');
    expect(PomodoroSettingsSchema.safeParse({ work_minutes: 0 }).success).toBe(false);
    expect(PomodoroSettingsSchema.safeParse({ long_every: 1 }).success).toBe(false);
    const settings = WorkspaceSettingsSchema.parse({});
    expect(settings.pomodoro).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(settings.features.pomodoro).toBe(true);
  });
});
