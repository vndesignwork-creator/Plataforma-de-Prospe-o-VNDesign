/**
 * Renovações e avenças: o que o cliente paga de forma repetida (domínio, alojamento,
 * manutenção mensal…), com a próxima data e um aviso uns dias antes.
 */
import { z } from 'zod';
import { formatCurrency, formatDate } from './format';

export const RENEWAL_KINDS = ['domain', 'hosting', 'maintenance', 'other'] as const;
export type RenewalKind = (typeof RENEWAL_KINDS)[number];
export const RENEWAL_KIND_LABELS: Record<RenewalKind, string> = {
  domain: 'Domínio',
  hosting: 'Alojamento',
  maintenance: 'Manutenção (avença)',
  other: 'Outro',
};
/** Nome sugerido ao escolher o tipo. */
export const RENEWAL_KIND_DEFAULT_TITLE: Record<RenewalKind, string> = {
  domain: 'Domínio',
  hosting: 'Alojamento do site',
  maintenance: 'Manutenção do site',
  other: '',
};

export const RENEWAL_PERIODS = ['monthly', 'quarterly', 'yearly'] as const;
export type RenewalPeriod = (typeof RENEWAL_PERIODS)[number];
export const RENEWAL_PERIOD_LABELS: Record<RenewalPeriod, string> = { monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual' };
const PERIOD_SUFFIX: Record<RenewalPeriod, string> = { monthly: '/mês', quarterly: '/trimestre', yearly: '/ano' };
export const RENEWAL_PERIOD_MONTHS: Record<RenewalPeriod, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** "120,00 €/ano". */
export const renewalPrice = (amount: number, period: RenewalPeriod) => `${formatCurrency(amount)}${PERIOD_SUFFIX[period]}`;

/** Quanto vale por mês (para a receita recorrente). */
export const renewalMonthly = (amount: number, period: RenewalPeriod) => amount / RENEWAL_PERIOD_MONTHS[period];

/** A data seguinte (mesmo dia, ou o último do mês se não existir: 31/01 → 28/02). */
export function nextRenewalDate(isoDate: string, period: RenewalPeriod): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + RENEWAL_PERIOD_MONTHS[period], 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Dias até à data (negativo = já passou). */
export function daysUntil(isoDate: string, today: string): number {
  return Math.round((Date.parse(`${isoDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

export const RenewalSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    kind: z.enum(RENEWAL_KINDS),
    title: z.string(),
    amount: z.number(),
    period: z.enum(RENEWAL_PERIODS),
    next_due_on: z.string(),
    remind_days: z.int(),
    active: z.boolean(),
    notes: z.string().nullable(),
    reminded_for: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'Renewal' });
export type Renewal = z.infer<typeof RenewalSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Data inválida.' });
const amountField = z.coerce.number({ error: 'Valor inválido.' }).min(0, { error: 'O valor não pode ser negativo.' }).max(9_999_999);
const notesField = z.string().trim().max(2000).nullable().optional().transform((v) => (v === undefined ? undefined : v || null));

export const RenewalCreateSchema = z
  .object({
    kind: z.enum(RENEWAL_KINDS).default('other'),
    title: z.string().trim().min(1, { error: 'Dá um nome (ex.: Domínio clinica.pt).' }).max(200),
    amount: amountField,
    period: z.enum(RENEWAL_PERIODS).default('yearly'),
    next_due_on: isoDate,
    remind_days: z.coerce.number().int().min(0).max(120).default(30),
    active: z.boolean().default(true),
    notes: notesField,
  })
  .meta({ id: 'RenewalCreate' });
export type RenewalCreate = z.infer<typeof RenewalCreateSchema>;

export const RenewalUpdateSchema = z
  .object({
    kind: z.enum(RENEWAL_KINDS).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    amount: amountField.optional(),
    period: z.enum(RENEWAL_PERIODS).optional(),
    next_due_on: isoDate.optional(),
    remind_days: z.coerce.number().int().min(0).max(120).optional(),
    active: z.boolean().optional(),
    notes: notesField,
  })
  .meta({ id: 'RenewalUpdate' });

export const RenewalRenewSchema = z
  .object({ record_payment: z.boolean().default(true).meta({ description: 'Regista o pagamento (pago hoje) nos Pagamentos do cliente' }) })
  .meta({ id: 'RenewalRenew' });

export const RecurringSummarySchema = z
  .object({
    monthly: z.number().meta({ description: 'Receita recorrente por mês (soma das ativas)' }),
    yearly: z.number(),
    active: z.int(),
    clients: z.int(),
    by_kind: z.array(z.object({ kind: z.enum(RENEWAL_KINDS), monthly: z.number(), count: z.int() })),
    upcoming: z.array(
      z.object({
        id: z.uuid(),
        lead_id: z.uuid(),
        lead_number: z.int(),
        company_name: z.string(),
        kind: z.enum(RENEWAL_KINDS),
        title: z.string(),
        amount: z.number(),
        period: z.enum(RENEWAL_PERIODS),
        next_due_on: z.string(),
      }),
    ),
  })
  .meta({ id: 'RecurringSummary' });
export type RecurringSummary = z.infer<typeof RecurringSummarySchema>;

/** Email ao cliente a lembrar a renovação (revês antes de enviar). */
export function renewalEmail(r: Pick<Renewal, 'kind' | 'title' | 'amount' | 'period' | 'next_due_on'>, contactName?: string | null): { subject: string; body: string } {
  const when = formatDate(r.next_due_on);
  const what = r.kind === 'maintenance' ? `a ${r.title.toLowerCase()}` : `o ${r.title}`;
  const greeting = contactName?.trim() ? `Olá ${contactName.trim().split(/\s+/)[0]},` : 'Olá,';
  const subject = r.kind === 'maintenance' ? `${r.title}: próximo período a ${when}` : `Renovação: ${r.title} (${when})`;
  const lines = [
    greeting,
    r.kind === 'maintenance'
      ? `Lembro que ${what} renova a ${when} (${renewalPrice(r.amount, r.period)}).`
      : `Lembro que ${what} renova a ${when}. O valor da renovação é ${renewalPrice(r.amount, r.period)}.`,
    'Para continuar tudo a funcionar sem interrupções, basta confirmar por aqui e trato do resto.',
    'Qualquer dúvida, estou à disposição.',
    'Cumprimentos,',
  ];
  return { subject, body: lines.map((l) => `<p>${l}</p>`).join('') };
}
