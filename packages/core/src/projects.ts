/**
 * Depois de fechar o negócio: pagamentos do cliente e a página "Projetos"
 * (clientes com o projeto em curso). Também as funções do calendário (.ics).
 */
import { z } from 'zod';

// (Sem importar de ./schemas: o schema "Hoje" de lá usa os daqui.)
const emptyToNull = (v: string) => (v === '' ? null : v);
const nullableDate = z
  .string()
  .trim()
  .transform(emptyToNull)
  .pipe(z.iso.date({ error: 'Data inválida.' }).nullable())
  .nullable()
  .meta({ description: 'Data no formato AAAA-MM-DD', example: '2026-10-08' });
const nullableText = (max: number) =>
  z.string().trim().max(max, { error: `Máximo de ${max} caracteres.` }).transform(emptyToNull).nullable();

// -----------------------------------------------------------------------------
// Pagamentos
// -----------------------------------------------------------------------------

export const LeadPaymentSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    description: z.string(),
    amount: z.number(),
    due_on: z.string().nullable().meta({ description: 'Data prevista (AAAA-MM-DD)' }),
    paid_on: z.string().nullable().meta({ description: 'Pago em (null = por receber)' }),
    method: z.string().nullable().meta({ description: 'Ex.: Transferência, MB Way' }),
    created_at: z.string(),
  })
  .meta({ id: 'LeadPayment' });
export type LeadPayment = z.infer<typeof LeadPaymentSchema>;

const amount = z
  .number({ error: 'Indica o valor.' })
  .positive({ error: 'O valor tem de ser maior que zero.' })
  .max(9_999_999, { error: 'Valor demasiado alto.' })
  .transform((v) => Math.round(v * 100) / 100);

export const LeadPaymentCreateSchema = z
  .object({
    description: z.string({ error: 'Descreve o pagamento.' }).trim().min(1, { error: 'Descreve o pagamento.' }).max(200),
    amount,
    due_on: nullableDate.optional().transform((v) => v ?? null),
    paid_on: nullableDate.optional().transform((v) => v ?? null),
    method: nullableText(60).optional().transform((v) => v ?? null),
  })
  .meta({ id: 'LeadPaymentCreate' });
export type LeadPaymentCreate = z.output<typeof LeadPaymentCreateSchema>;

export const LeadPaymentUpdateSchema = z
  .object({
    description: z.string().trim().min(1, { error: 'Descreve o pagamento.' }).max(200),
    amount,
    due_on: nullableDate,
    paid_on: nullableDate,
    method: nullableText(60),
  })
  .partial()
  .meta({ id: 'LeadPaymentUpdate' });
export type LeadPaymentUpdate = z.output<typeof LeadPaymentUpdateSchema>;

/** Plano de pagamentos pronto (ex.: 50% de sinal + 50% na entrega). */
export const PaymentPlanSchema = z
  .object({
    total: amount,
    /** Percentagens que somam 100 (ex.: [50, 50] ou [30, 40, 30]). */
    split: z
      .array(z.int().min(1).max(100))
      .min(1)
      .max(6)
      .refine((s) => s.reduce((a, b) => a + b, 0) === 100, { error: 'As percentagens têm de somar 100.' }),
  })
  .meta({ id: 'PaymentPlan' });
export type PaymentPlan = z.output<typeof PaymentPlanSchema>;

export const PAYMENT_PLANS = [
  { label: '50% sinal + 50% na entrega', split: [50, 50] },
  { label: '30% + 40% + 30%', split: [30, 40, 30] },
  { label: 'Pagamento único', split: [100] },
] as const;

/** Nomes das prestações de um plano ("Sinal (50%)", "Entrega (50%)"…). */
export function paymentPlanItems(total: number, split: readonly number[]): { description: string; amount: number }[] {
  const amounts = split.map((p) => Math.floor(total * p) / 100);
  // O resto dos arredondamentos vai para a última prestação (o total bate certo ao cêntimo).
  const diff = Math.round((total - amounts.reduce((a, b) => a + b, 0)) * 100) / 100;
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1]! + diff) * 100) / 100;
  return split.map((p, i) => ({
    description:
      split.length === 1 ? 'Pagamento único' : i === 0 ? `Sinal (${p}%)` : i === split.length - 1 ? `Entrega (${p}%)` : `Prestação ${i + 1} (${p}%)`,
    amount: amounts[i]!,
  }));
}

export interface PaymentSummary {
  total: number;
  paid: number;
  outstanding: number;
  overdue: number;
  overdue_count: number;
}

export const PaymentSummarySchema = z
  .object({ total: z.number(), paid: z.number(), outstanding: z.number(), overdue: z.number(), overdue_count: z.int() })
  .meta({ id: 'PaymentSummary' });

export function summarizePayments(payments: readonly Pick<LeadPayment, 'amount' | 'paid_on' | 'due_on'>[], today: string): PaymentSummary {
  const r = (v: number) => Math.round(v * 100) / 100;
  let total = 0;
  let paid = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const p of payments) {
    total += p.amount;
    if (p.paid_on) paid += p.amount;
    else if (p.due_on && p.due_on < today) {
      overdue += p.amount;
      overdueCount += 1;
    }
  }
  return { total: r(total), paid: r(paid), outstanding: r(total - paid), overdue: r(overdue), overdue_count: overdueCount };
}

// -----------------------------------------------------------------------------
// iCalendar (calendário para subscrever)
// -----------------------------------------------------------------------------

/** Texto de um campo do iCalendar (RFC 5545): escapa e dobra linhas compridas. */
export function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
export function icsFold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}
export const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');


/** Faturação (Dashboard): recebido no mês, por receber e em atraso. */
export const BillingSummarySchema = z
  .object({
    received_month: z.number(),
    outstanding: z.number(),
    overdue: z.number(),
    overdue_count: z.int(),
    active_projects: z.int(),
  })
  .meta({ id: 'BillingSummary' });
export type BillingSummary = z.infer<typeof BillingSummarySchema>;
