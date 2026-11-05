/**
 * Relatório mensal para a contabilidade: o que se recebeu (pagamentos com data de
 * pagamento no mês), o que se gastou (despesas dos projetos) e o que está por receber.
 */
import { z } from 'zod';

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const ACCOUNTING_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-11" → "novembro de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

/** Primeiro e último dia do mês (AAAA-MM-DD). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Os últimos N meses, do mais recente para trás ("2026-11", "2026-10"…). */
export function recentMonths(today: string, count = 12): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const Row = z.object({
  date: z.string().nullable(),
  client: z.string(),
  lead_number: z.int().nullable(),
  description: z.string(),
  amount: z.number(),
});

export const AccountingReportSchema = z
  .object({
    month: z.string(),
    label: z.string(),
    from: z.string(),
    to: z.string(),
    received: z.object({ total: z.number(), rows: z.array(Row.extend({ method: z.string().nullable() })) }),
    expenses: z.object({ total: z.number(), rows: z.array(Row) }),
    outstanding: z.object({
      total: z.number().meta({ description: 'Tudo o que está por pagar, com data até ao fim do mês (ou sem data)' }),
      overdue: z.number().meta({ description: 'Do total, o que já passou da data' }),
      rows: z.array(Row.extend({ overdue: z.boolean() })),
    }),
    result: z.number().meta({ description: 'Recebido − despesas' }),
  })
  .meta({ id: 'AccountingReport' });
export type AccountingReport = z.infer<typeof AccountingReportSchema>;
