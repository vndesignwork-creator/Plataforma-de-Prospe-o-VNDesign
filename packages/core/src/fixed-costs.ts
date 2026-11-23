/**
 * Custos fixos mensais (alojamento, software, seguros…). Não são de nenhum
 * projeto: pagam-se todos os meses e, sem eles, o "lucro" dos relatórios é
 * maior do que o verdadeiro.
 */
import { z } from 'zod';

const amount = z
  .number({ error: 'Indica o valor.' })
  .positive({ error: 'O valor tem de ser maior do que zero.' })
  .max(9_999_999, { error: 'Valor demasiado alto.' })
  .transform((v) => Math.round(v * 100) / 100);

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Usa o formato AAAA-MM.' });

export const FixedCostSchema = z
  .object({
    id: z.uuid(),
    description: z.string(),
    amount: z.number(),
    /** Primeiro mês em que se paga ("AAAA-MM"). */
    starts_on: z.string(),
    /** Último mês em que se paga, ou null (continua). */
    ends_on: z.string().nullable(),
    note: z.string().nullable(),
  })
  .meta({ id: 'FixedCost' });
export type FixedCost = z.infer<typeof FixedCostSchema>;

export const FixedCostInputSchema = z
  .object({
    description: z.string({ error: 'Descreve o custo.' }).trim().min(1, { error: 'Descreve o custo.' }).max(200),
    amount,
    starts_on: month,
    ends_on: month.nullish().transform((v) => v ?? null),
    note: z.string().trim().max(500).nullish().transform((v) => v || null),
  })
  .refine((v) => !v.ends_on || v.ends_on >= v.starts_on, { path: ['ends_on'], error: 'O fim não pode ser antes do início.' })
  .meta({ id: 'FixedCostInput' });
export type FixedCostInput = z.input<typeof FixedCostInputSchema>;

/** Os custos que valem num mês ("AAAA-MM"). */
export function fixedCostsForMonth(costs: readonly FixedCost[], month: string): FixedCost[] {
  return costs.filter((c) => c.starts_on <= month && (!c.ends_on || c.ends_on >= month));
}

/** Quanto se paga de fixo nesse mês. */
export function fixedCostsTotal(costs: readonly FixedCost[], month: string): number {
  return Math.round(fixedCostsForMonth(costs, month).reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
}

/** "Desde 11/2026" / "11/2026 a 03/2027" (para se ler na lista). */
export function fixedCostPeriod(cost: Pick<FixedCost, 'starts_on' | 'ends_on'>): string {
  const pt = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
  return cost.ends_on ? `${pt(cost.starts_on)} a ${pt(cost.ends_on)}` : `desde ${pt(cost.starts_on)}`;
}
