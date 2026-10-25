/**
 * Horário de silêncio das notificações push (preferência de cada pessoa):
 * entre "de" e "até" (pode passar a meia-noite, ex.: 21:00 → 08:00) e,
 * se escolher, o fim de semana inteiro. Os avisos no sino da plataforma
 * continuam; os lembretes das tarefas esperam pelo fim do silêncio.
 */
import { z } from 'zod';

export const QUIET_HOURS_PREFERENCE = 'notifications.quiet';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Hora inválida (HH:MM).' });

export const QuietHoursSchema = z.object({
  enabled: z.boolean().default(false),
  from: Time.default('21:00'),
  to: Time.default('08:00'),
  /** Sábado e domingo sem notificações (o dia todo). */
  weekends: z.boolean().default(false),
});
export type QuietHours = z.infer<typeof QuietHoursSchema>;

export const DEFAULT_QUIET_HOURS: QuietHours = QuietHoursSchema.parse({});

/** Lê o valor guardado (null ou inválido = por omissão, desligado). */
export function parseQuietHours(value: unknown): QuietHours {
  const parsed = QuietHoursSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_QUIET_HOURS;
}

const lisbon = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Está agora (hora de Lisboa) dentro do horário de silêncio? */
export function isQuietTime(quiet: QuietHours, now: Date = new Date()): boolean {
  if (!quiet.enabled) return false;
  const parts = Object.fromEntries(lisbon.formatToParts(now).map((p) => [p.type, p.value]));
  if (quiet.weekends && (parts.weekday === 'Sat' || parts.weekday === 'Sun')) return true;
  const from = minutes(quiet.from);
  const to = minutes(quiet.to);
  if (from === to) return false;
  const at = Number(parts.hour) * 60 + Number(parts.minute);
  return from < to ? at >= from && at < to : at >= from || at < to;
}
