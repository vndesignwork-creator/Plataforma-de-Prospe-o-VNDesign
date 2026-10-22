import { describe, expect, it } from 'vitest';
import { ContractAcceptSchema, buildContractContent } from '../src/contracts';
import { buildCalendarFeed, describeProjectStart, lastMonths, projectProfit } from '../src/project-tools';

describe('contrato', () => {
  const base = {
    provider: { name: 'Va Nancassa', company: 'VNDesign', nif: '123456789', address: null, email: 'va@vndesign.pt', phone: null },
    client: { name: 'Rita', company: 'Padaria Sol', nif: null, address: 'Amadora', email: null, phone: null },
  };

  it('monta objeto, prazo, revisões, pagamentos e condições a partir da proposta', () => {
    const c = buildContractContent({
      ...base,
      proposal: { items: [{ name: 'Site institucional', description: '5 páginas', price: 1200, quantity: 1 }], total: 1200, payment_terms: null },
      dueOn: '2026-11-30',
      revisionsIncluded: 1,
      payments: [
        { description: 'Sinal (50%)', amount: 600, due_on: '2026-10-22' },
        { description: 'Entrega (50%)', amount: 600, due_on: null },
      ],
      taxNote: 'Valores sem IVA.',
      clauses: 'Primeira condição.\n\nSegunda condição.',
    });
    expect(c.sections.map((s) => s.title)).toEqual(['Objeto', 'Prazo', 'Revisões', 'Valor e pagamentos', 'Condições gerais']);
    expect(c.sections[0]!.body).toContain('VNDesign compromete-se a realizar para Padaria Sol');
    expect(c.sections[0]!.body).toContain('• Site institucional — 5 páginas');
    expect(c.sections[1]!.body).toContain('até 30/11/2026');
    expect(c.sections[2]!.body).toContain('1 ronda de revisão');
    expect(c.sections[3]!.body).toMatch(/Valor total: 1200,00\s€\. Valores sem IVA\./);
    expect(c.sections[3]!.body).toMatch(/• Entrega \(50%\): 600,00\s€ — na entrega/);
    expect(c.sections[4]!.body).toBe('• Primeira condição.\n• Segunda condição.');
  });

  it('sem proposta usa os serviços e o valor estimado; aceitar exige nome e confirmação', () => {
    const c = buildContractContent({ ...base, servicesText: 'identidade visual', estimatedValue: 500 });
    expect(c.sections[0]!.body).toContain('os serviços de identidade visual');
    expect(c.sections[1]!.body).toContain('combinada entre as partes');
    expect(c.sections).toHaveLength(4);
    expect(ContractAcceptSchema.safeParse({ name: 'Rita Sol', agree: true }).success).toBe(true);
    expect(ContractAcceptSchema.safeParse({ name: 'Rita Sol', agree: false }).success).toBe(false);
  });
});

describe('calendário subscrito', () => {
  it('reuniões com hora e entregas de dia inteiro', () => {
    const ics = buildCalendarFeed(
      [
        { uid: 'm1@x', title: 'Reunião · Padaria, Lda', startsAt: '2026-10-28T10:00:00Z', durationMin: 45, location: 'Google Meet' },
        { uid: 'd1@x', title: 'Entrega · Padaria', date: '2026-10-31' },
      ],
      { name: 'VNDesign Leads', now: new Date('2026-10-22T08:00:00Z') },
    );
    expect(ics).toContain('X-WR-CALNAME:VNDesign Leads');
    expect(ics).toContain('DTSTART:20261028T100000Z\r\nDTEND:20261028T104500Z');
    expect(ics).toContain('SUMMARY:Reunião · Padaria\\, Lda');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('projetos', () => {
  it('lucro e ganho líquido por hora', () => {
    expect(projectProfit(1000, 200, 600)).toEqual({ profit: 800, net_rate: 80 });
    expect(projectProfit(1000, 0, 10)).toEqual({ profit: 1000, net_rate: null });
    expect(projectProfit(null, 50, 600)).toEqual({ profit: -50, net_rate: null });
  });

  it('últimos 12 meses e resumo do arranque', () => {
    expect(lastMonths('2026-10-22', 3)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(lastMonths('2026-01-05', 2)).toEqual(['2025-12', '2026-01']);
    expect(
      describeProjectStart({ tasks: 8, templates: ['Site Institucional'], due_on: '2026-11-21', payments: 2, revisions: 2 }, (d) => d.split('-').reverse().join('/')),
    ).toBe('8 tarefas (Site Institucional) · entrega a 21/11/2026 · plano de 2 pagamentos · 2 revisões incluídas');
  });
});
