/**
 * Formatação em português europeu: DD/MM/AAAA, euros, fuso Europe/Lisbon.
 */

export const TIME_ZONE = 'Europe/Lisbon';

const currencyFormatter = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const integerCurrencyFormatter = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "2026-10-08" (ou Date/timestamp) → "08/10/2026". */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const iso = isoDateFormatter.format(date);
  return formatDate(iso);
}

/** Timestamp → "08/10/2026, 14:05" (hora de Lisboa). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return dateTimeFormatter.format(date);
}

/** 1250.5 → "1250,50 €" */
export function formatCurrency(value: number | null | undefined, opts?: { decimals?: boolean }): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return (opts?.decimals === false ? integerCurrencyFormatter : currencyFormatter).format(value);
}

/** 0.125 → "12,5%" */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

/** Data de hoje em Lisboa, "AAAA-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return isoDateFormatter.format(now);
}

/** Soma dias a uma data "AAAA-MM-DD". */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Diferença em dias entre duas datas "AAAA-MM-DD" (b − a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}
