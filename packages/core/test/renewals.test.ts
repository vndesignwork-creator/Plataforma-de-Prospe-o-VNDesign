import { describe, expect, it } from 'vitest';
import { daysUntil, nextRenewalDate, renewalEmail, renewalMonthly, renewalPrice } from '../src/renewals';

describe('renovações', () => {
  it('passa à data seguinte (e acerta o fim do mês)', () => {
    expect(nextRenewalDate('2026-03-15', 'yearly')).toBe('2027-03-15');
    expect(nextRenewalDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextRenewalDate('2027-11-30', 'quarterly')).toBe('2028-02-29');
    expect(nextRenewalDate('2026-12-10', 'monthly')).toBe('2027-01-10');
  });
  it('vale por mês', () => {
    expect(renewalMonthly(120, 'yearly')).toBe(10);
    expect(renewalMonthly(45, 'quarterly')).toBe(15);
    expect(renewalMonthly(50, 'monthly')).toBe(50);
  });
  it('dias até à data', () => {
    expect(daysUntil('2026-11-10', '2026-11-05')).toBe(5);
    expect(daysUntil('2026-11-01', '2026-11-05')).toBe(-4);
  });
  it('email ao cliente', () => {
    const email = renewalEmail({ kind: 'domain', title: 'Domínio clinica.pt', amount: 15, period: 'yearly', next_due_on: '2027-03-15' }, 'Marta Silva');
    expect(email.subject).toBe('Renovação: Domínio clinica.pt (15/03/2027)');
    expect(email.body).toContain('Olá Marta,');
    expect(email.body).toContain(renewalPrice(15, 'yearly'));
  });
});
