/**
 * Horas a evitar para ligar, por setor (ex.: restauração, das 12h às 15h). A
 * Prospeção (a ligar) põe primeiro os leads em que agora é boa altura.
 */
import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const CallAvoidWindowSchema = z
  .object({
    from: z.string().regex(HHMM, { error: 'Hora inválida (HH:MM).' }),
    to: z.string().regex(HHMM, { error: 'Hora inválida (HH:MM).' }),
  })
  .refine((w) => w.from !== w.to, { error: 'A hora de início e de fim não podem ser iguais.' });
export type CallAvoidWindow = z.infer<typeof CallAvoidWindowSchema>;

/** Por setor (id): até 4 intervalos. */
export const CallAvoidSchema = z.record(z.string(), z.array(CallAvoidWindowSchema).max(4, { error: 'No máximo 4 intervalos.' }));
export type CallAvoid = z.infer<typeof CallAvoidSchema>;

/** Intervalos comuns, para escolher com um toque. */
export const CALL_AVOID_PRESETS: { label: string; window: CallAvoidWindow }[] = [
  { label: 'Hora de almoço (12h–15h)', window: { from: '12:00', to: '15:00' } },
  { label: 'Jantar (19h–22h30)', window: { from: '19:00', to: '22:30' } },
  { label: 'Abertura (até às 10h)', window: { from: '08:00', to: '10:00' } },
  { label: 'Fim do dia (depois das 18h)', window: { from: '18:00', to: '21:00' } },
];

const short = (hhmm: string) => (hhmm.endsWith(':00') ? `${Number(hhmm.slice(0, 2))}h` : `${Number(hhmm.slice(0, 2))}h${hhmm.slice(3)}`);
export const callWindowLabel = (w: CallAvoidWindow) => `${short(w.from)}–${short(w.to)}`;

/** "HH:MM" agora em Lisboa. */
export function lisbonTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** O intervalo a evitar em que estamos agora (ou null). Intervalos que passam da meia-noite também contam. */
export function currentAvoidWindow(windows: readonly CallAvoidWindow[] | null | undefined, now: Date = new Date()): CallAvoidWindow | null {
  if (!windows?.length) return null;
  const t = lisbonTime(now);
  return windows.find((w) => (w.from < w.to ? t >= w.from && t < w.to : t >= w.from || t < w.to)) ?? null;
}
