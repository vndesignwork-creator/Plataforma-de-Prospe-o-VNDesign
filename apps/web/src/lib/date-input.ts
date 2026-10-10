/**
 * Datas escritas à mão nos campos de data ("15/10/2026", "15-10-26", "2026-10-15")
 * e a grelha do calendário (semana a começar à segunda, como em Portugal).
 * Trabalha com datas "AAAA-MM-DD" e, nos lembretes, "AAAA-MM-DDTHH:MM" (hora local).
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function valid(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "15/10/2026", "5-1-26", "15.10.2026" ou "2026-10-15" → "2026-10-15"; senão null. */
export function parseDateText(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? toIsoDate(y, mo, d) : null;
  }
  m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, mo, d) ? toIsoDate(y, mo, d) : null;
  }
  return null;
}

/** "2026-10-15" → "15/10/2026". */
export function formatDateText(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** "9:5", "09:05", "9h", "9h30", "0930" → "09:05"…; senão null. */
export function parseTimeText(text: string): string | null {
  const t = text.trim().toLowerCase();
  const m = /^(\d{1,2})(?:[:h.]?(\d{2}))?h?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

/** "15/10/2026 10:30" ou "2026-10-15T10:30" → "2026-10-15T10:30" (sem hora: 09:00); senão null. */
export function parseDateTimeText(text: string, defaultTime = '09:00'): string | null {
  const t = text.trim();
  const iso = /^(\d{4}-\d{1,2}-\d{1,2})[T\s](\d{1,2}:\d{2})$/.exec(t);
  if (iso) {
    const date = parseDateText(iso[1]!);
    const time = parseTimeText(iso[2]!);
    return date && time ? `${date}T${time}` : null;
  }
  const m = /^(\S+)(?:\s+(?:às\s+)?(\S+))?$/.exec(t);
  if (!m) return null;
  const date = parseDateText(m[1]!);
  const time = m[2] === undefined ? defaultTime : parseTimeText(m[2]);
  return date && time ? `${date}T${time}` : null;
}

/** "2026-10-15T10:30" → "15/10/2026 10:30". */
export function formatDateTimeText(local: string | null | undefined): string {
  if (!local) return '';
  const [date, time] = local.split('T');
  return date ? `${formatDateText(date)}${time ? ` ${time.slice(0, 5)}` : ''}` : '';
}

export const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
export const WEEKDAYS_PT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** Soma dias a "AAAA-MM-DD". */
export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Soma meses a "AAAA-MM-DD" (o dia fica no último do mês se não existir). */
export function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return toIsoDate(year, month, Math.min(d!, last));
}

/** 6 semanas (42 dias, de segunda a domingo) que mostram o mês de `iso`. */
export function monthGrid(iso: string): string[] {
  const [y, m] = iso.split('-').map(Number);
  const first = toIsoDate(y!, m!, 1);
  const weekday = (new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay() + 6) % 7; // 0 = segunda
  const start = shiftDays(first, -weekday);
  return Array.from({ length: 42 }, (_, i) => shiftDays(start, i));
}
