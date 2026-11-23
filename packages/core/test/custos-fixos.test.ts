import { describe, expect, it } from 'vitest';
import { FixedCostInputSchema, fixedCostPeriod, fixedCostsForMonth, fixedCostsTotal, type FixedCost } from '../src';

const custo = (id: string, amount: number, starts_on: string, ends_on: string | null = null): FixedCost => ({
  id,
  description: id,
  amount,
  starts_on,
  ends_on,
  note: null,
});

describe('custos fixos', () => {
  const lista = [custo('alojamento', 12, '2026-01'), custo('software', 30, '2026-11'), custo('antigo', 50, '2025-01', '2026-10')];

  it('só conta os que valem naquele mês', () => {
    expect(fixedCostsForMonth(lista, '2026-11').map((c) => c.id)).toEqual(['alojamento', 'software']);
    expect(fixedCostsForMonth(lista, '2026-10').map((c) => c.id)).toEqual(['alojamento', 'antigo']);
    expect(fixedCostsForMonth(lista, '2024-12')).toEqual([]);
  });

  it('soma ao cêntimo', () => {
    expect(fixedCostsTotal(lista, '2026-11')).toBe(42);
    expect(fixedCostsTotal([custo('a', 10.1, '2026-01'), custo('b', 20.2, '2026-01')], '2026-05')).toBe(30.3);
    expect(fixedCostsTotal(lista, '2020-01')).toBe(0);
  });

  it('escreve o período em português', () => {
    expect(fixedCostPeriod({ starts_on: '2026-11', ends_on: null })).toBe('desde 11/2026');
    expect(fixedCostPeriod({ starts_on: '2026-11', ends_on: '2027-03' })).toBe('11/2026 a 03/2027');
  });

  it('não aceita um fim antes do início nem meses inválidos', () => {
    expect(FixedCostInputSchema.safeParse({ description: 'X', amount: 10, starts_on: '2026-11', ends_on: '2026-10' }).success).toBe(false);
    expect(FixedCostInputSchema.safeParse({ description: 'X', amount: 10, starts_on: '2026-13' }).success).toBe(false);
    expect(FixedCostInputSchema.safeParse({ description: 'X', amount: 0, starts_on: '2026-11' }).success).toBe(false);
    expect(FixedCostInputSchema.safeParse({ description: 'Alojamento', amount: 12.5, starts_on: '2026-11' }).success).toBe(true);
  });
});
