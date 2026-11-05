import { describe, expect, it } from 'vitest';
import { monthLabel, monthRange, recentMonths } from '../src/accounting';

describe('relatório da contabilidade', () => {
  it('nome e intervalo do mês', () => {
    expect(monthLabel('2026-11')).toBe('novembro de 2026');
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('últimos meses, a passar de ano', () => {
    expect(recentMonths('2026-02-10', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });
});
