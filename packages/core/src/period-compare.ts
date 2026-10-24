/**
 * Estatísticas: este mês (ou esta semana) contra o anterior até ao mesmo dia —
 * comparar 1–24 de outubro com 1–24 de setembro, não com o mês inteiro.
 */
import { z } from 'zod';
import { addDays } from './format';
import { weekStart } from './project-tools';

export const COMPARE_PERIODS = ['month', 'week'] as const;
export type ComparePeriod = (typeof COMPARE_PERIODS)[number];

export const PeriodCompareQuerySchema = z
  .object({ period: z.enum(COMPARE_PERIODS).default('month') })
  .meta({ id: 'PeriodCompareQuery' });

export const COMPARE_METRICS = ['new_leads', 'contacted', 'replied', 'meetings', 'proposals', 'won', 'received'] as const;
export type CompareMetric = (typeof COMPARE_METRICS)[number];
export const COMPARE_METRIC_LABELS: Record<CompareMetric, string> = {
  new_leads: 'Leads novos',
  contacted: 'Primeiros contactos',
  replied: 'Respostas',
  meetings: 'Reuniões marcadas',
  proposals: 'Propostas enviadas',
  won: 'Clientes ganhos',
  received: 'Recebido',
};

export const PeriodCompareSchema = z
  .object({
    period: z.enum(COMPARE_PERIODS),
    current: z.object({ from: z.string(), to: z.string() }),
    previous: z.object({ from: z.string(), to: z.string() }),
    metrics: z.array(z.object({ key: z.enum(COMPARE_METRICS), current: z.number(), previous: z.number() })),
  })
  .meta({ id: 'PeriodCompare' });
export type PeriodCompare = z.infer<typeof PeriodCompareSchema>;

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Os dois intervalos (AAAA-MM-DD, inclusivos) a comparar. */
export function comparePeriods(period: ComparePeriod, today: string): { current: { from: string; to: string }; previous: { from: string; to: string } } {
  if (period === 'week') {
    const from = weekStart(today);
    return { current: { from, to: today }, previous: { from: addDays(from, -7), to: addDays(today, -7) } };
  }
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = Math.min(d, daysInMonth(py, pm));
  return {
    current: { from: `${y}-${pad(m)}-01`, to: today },
    previous: { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay)}` },
  };
}

/** A diferença para mostrar: "+3", "−20%"; null quando não dá para comparar. */
export function compareDelta(current: number, previous: number): { diff: number; percent: number | null; trend: 'up' | 'down' | 'same' } {
  const diff = current - previous;
  return {
    diff,
    percent: previous > 0 ? Math.round((diff / previous) * 100) : null,
    trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
  };
}
