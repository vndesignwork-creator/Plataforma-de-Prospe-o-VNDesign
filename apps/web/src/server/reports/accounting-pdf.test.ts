import { describe, expect, it } from 'vitest';
import { accountingPdf } from './accounting-pdf';

describe('relatório mensal em PDF', () => {
  it('sai também num mês sem pagamentos, despesas nem nada por receber', async () => {
    const pdf = await accountingPdf(
      {
        month: '2026-10',
        label: 'outubro de 2026',
        from: '2026-10-01',
        to: '2026-10-31',
        received: { total: 0, rows: [] },
        expenses: { total: 0, rows: [] },
        outstanding: { total: 0, overdue: 0, rows: [] },
        result: 0,
      },
      'VNDesign',
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
