import { describe, expect, it } from 'vitest';
import { buildMeetingIcs, paymentPlanItems, summarizePayments } from '../src/projects';
import { WorkspaceSettingsSchema } from '../src/schemas';
import { topAuditIssues } from '../src/audit';

describe('pagamentos', () => {
  it('plano 50/50 e 30/40/30 batem certo ao cêntimo', () => {
    expect(paymentPlanItems(1500, [50, 50])).toEqual([
      { description: 'Sinal (50%)', amount: 750 },
      { description: 'Entrega (50%)', amount: 750 },
    ]);
    const odd = paymentPlanItems(999.99, [30, 40, 30]);
    expect(odd.map((i) => i.description)).toEqual(['Sinal (30%)', 'Prestação 2 (40%)', 'Entrega (30%)']);
    expect(Math.round(odd.reduce((a, i) => a + i.amount, 0) * 100) / 100).toBe(999.99);
    expect(paymentPlanItems(800, [100])).toEqual([{ description: 'Pagamento único', amount: 800 }]);
  });

  it('resumo: recebido, em falta e em atraso', () => {
    const s = summarizePayments(
      [
        { amount: 750, paid_on: '2026-10-01', due_on: '2026-10-01' },
        { amount: 500, paid_on: null, due_on: '2026-10-10' },
        { amount: 250, paid_on: null, due_on: null },
      ],
      '2026-10-20',
    );
    expect(s).toEqual({ total: 1500, paid: 750, outstanding: 750, overdue: 500, overdue_count: 1 });
  });
});

describe('convite de calendário (.ics)', () => {
  it('pedido com organizador, convidado e alarme', () => {
    const ics = buildMeetingIcs({
      uid: 'abc@vndesign-leads',
      startsAt: '2026-10-28T10:00:00.000Z',
      durationMin: 45,
      title: 'Reunião VNDesign · Padaria, Lda',
      location: 'Rua A, 1; Amadora',
      organizer: { name: 'Va', email: 'va@vndesign.pt' },
      attendee: { name: 'Sr. Manuel', email: 'geral@padaria.pt' },
      now: new Date('2026-10-20T09:00:00Z'),
    });
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('DTSTART:20261028T100000Z');
    expect(ics).toContain('DTEND:20261028T104500Z');
    expect(ics).toContain('SUMMARY:Reunião VNDesign · Padaria\\, Lda');
    expect(ics).toContain('LOCATION:Rua A\\, 1\\; Amadora');
    expect(ics).toContain('mailto:geral@padaria.pt');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
  it('cancelamento', () => {
    const ics = buildMeetingIcs({
      uid: 'abc', startsAt: '2026-10-28T10:00:00Z', durationMin: 30, title: 'X', organizer: { name: 'Va', email: 'va@vndesign.pt' }, method: 'CANCEL',
    });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });
});

describe('definições', () => {
  it('funcionalidades ligadas e cópia semanal à segunda por omissão', () => {
    const s = WorkspaceSettingsSchema.parse({});
    expect(s.features).toEqual({ diagnosis_report: true, payments: true, meetings: true, projects: true });
    expect(s.weekly_backup).toMatchObject({ enabled: true, weekday: 1, recipient: null, last_sent_at: null });
  });
});

describe('relatório de diagnóstico', () => {
  it('os problemas graves primeiro, no máximo 3', () => {
    const issues = [
      { code: 'a', severity: 'low' as const },
      { code: 'b', severity: 'high' as const },
      { code: 'c', severity: 'medium' as const },
      { code: 'd', severity: 'high' as const },
    ];
    expect(topAuditIssues(issues).map((i) => i.code)).toEqual(['b', 'd', 'c']);
  });
});
