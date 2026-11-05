/**
 * Metas do mês (substituem o objetivo do dia da Prospeção): recebido em €, propostas,
 * clientes novos, emails, chamadas e WhatsApp. As metas ficam nas definições do
 * workspace e valem todos os meses até serem mudadas; o progresso conta o mês de Lisboa.
 */
import { z } from 'zod';
import { formatCurrency } from './format';

export const GOAL_METRICS = ['revenue', 'proposals', 'clients', 'emails', 'calls', 'whatsapp'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_LABELS: Record<GoalMetric, string> = {
  revenue: 'Recebido',
  proposals: 'Propostas enviadas',
  clients: 'Clientes novos',
  emails: 'Emails enviados',
  calls: 'Chamadas',
  whatsapp: 'WhatsApp enviados',
};
/** Singular e plural para "3 de 20 chamadas". (revenue: em €.) */
export const GOAL_UNITS: Record<GoalMetric, [string, string]> = {
  revenue: ['€', '€'],
  proposals: ['proposta', 'propostas'],
  clients: ['cliente', 'clientes'],
  emails: ['email', 'emails'],
  calls: ['chamada', 'chamadas'],
  whatsapp: ['WhatsApp', 'WhatsApp'],
};
export const GOAL_HINTS: Record<GoalMetric, string> = {
  revenue: 'Pagamentos marcados como pagos neste mês.',
  proposals: 'Leads que passaram a "Proposta enviada".',
  clients: 'Leads que passaram a Cliente.',
  emails: 'Emails enviados (pela plataforma ou marcados como enviados).',
  calls: 'Leads a quem se ligou (cada lead conta uma vez por dia).',
  whatsapp: 'Leads a quem se mandou WhatsApp (cada lead conta uma vez por dia).',
};
/** Os da Prospeção (cada modo mostra os seus no topo da sessão). */
export const PROSPECTING_GOALS = { email: ['emails'], phone: ['calls', 'whatsapp'] } as const satisfies Record<string, readonly GoalMetric[]>;

const target = (max: number) => z.number().int().min(1).max(max).nullable().optional();
/** As metas (null/ausente = sem meta). */
export const MonthlyGoalsSchema = z
  .object({
    revenue: target(10_000_000),
    proposals: target(10_000),
    clients: target(10_000),
    emails: target(100_000),
    calls: target(100_000),
    whatsapp: target(100_000),
  })
  .meta({ id: 'MonthlyGoals' });
export type MonthlyGoals = z.infer<typeof MonthlyGoalsSchema>;

export const GoalCountsSchema = z
  .object({
    revenue: z.number(),
    proposals: z.number(),
    clients: z.number(),
    emails: z.number(),
    calls: z.number(),
    whatsapp: z.number(),
  })
  .meta({ id: 'GoalCounts' });
export type GoalCounts = z.infer<typeof GoalCountsSchema>;

export const GoalProgressSchema = z
  .object({
    month: z.string().meta({ description: 'Mês (AAAA-MM)' }),
    from: z.string(),
    to: z.string(),
    /** Parte do mês já passada (0–1, em dias úteis), para "no ritmo" / "atrás". */
    elapsed: z.number(),
    goals: MonthlyGoalsSchema,
    team: GoalCountsSchema.meta({ description: 'O que a equipa toda fez neste mês' }),
    mine: GoalCountsSchema.meta({ description: 'O que a pessoa fez (emails, chamadas, WhatsApp; o resto é igual ao da equipa)' }),
    previous_daily: z
      .object({ email: z.number().nullable(), phone: z.number().nullable() })
      .optional()
      .meta({ description: 'O antigo objetivo do dia da pessoa (para sugerir as metas do mês)' }),
  })
  .meta({ id: 'GoalProgress' });
export type GoalProgress = z.infer<typeof GoalProgressSchema>;

export const GoalProgressQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Mês inválido (AAAA-MM).' })
    .optional()
    .meta({ description: 'Mês (AAAA-MM); vazio = o mês atual' }),
});

const isWeekday = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
};

/** Primeiro e último dia do mês (AAAA-MM). */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Parte do mês já passada, em dias úteis (hoje conta como meio dia). 0 antes, 1 depois. */
export function monthElapsed(month: string, today: string): number {
  const { from, to } = monthBounds(month);
  if (today < from) return 0;
  if (today > to) return 1;
  let total = 0;
  let done = 0;
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!isWeekday(iso)) continue;
    total++;
    if (iso < today) done++;
    else if (iso === today) done += 0.5;
  }
  return total ? Math.min(1, done / total) : 1;
}

export type GoalPace = 'reached' | 'ahead' | 'on_track' | 'behind';
/** Atingida, à frente, no ritmo ou atrás (comparado com a parte do mês já passada). */
export function goalPace(done: number, goal: number, elapsed: number): GoalPace {
  if (done >= goal) return 'reached';
  const expected = goal * elapsed;
  if (done >= expected * 1.1) return 'ahead';
  if (done >= expected * 0.85) return 'on_track';
  return 'behind';
}
export const GOAL_PACE_LABELS: Record<GoalPace, string> = {
  reached: 'Atingida',
  ahead: 'À frente',
  on_track: 'No ritmo',
  behind: 'Atrás do ritmo',
};

/** Metas que faltam: quanto falta por dia útil até ao fim do mês (arredondado para cima). */
export function perWorkdayLeft(done: number, goal: number, month: string, today: string): number | null {
  const { to } = monthBounds(month);
  if (done >= goal || today > to) return null;
  let left = 0;
  for (let d = new Date(`${today}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    if (isWeekday(d.toISOString().slice(0, 10))) left++;
  }
  return left ? Math.ceil((goal - done) / left) : null;
}

/** Valores para mostrar: "1 250 €" ou "12". */
export function formatGoalValue(metric: GoalMetric, value: number): string {
  if (metric === 'revenue') return formatCurrency(value, { decimals: false });
  return String(Math.round(value));
}
