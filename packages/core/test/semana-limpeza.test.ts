import { describe, expect, it } from 'vitest';
import {
  CALENDAR_EVENT_TYPES,
  LeadUpdateSchema,
  LeadListQuerySchema,
  buildProjectUpdate,
  groupDuplicatePairs,
  meetingNotesResult,
  normalizeTags,
  pickPrimary,
  weekStart,
} from '../src';

describe('etiquetas', () => {
  it('sem repetidas (maiúsculas e acentos contam como iguais), sem vírgulas, até 10', () => {
    expect(normalizeTags([' Feira  de março ', 'feira de marco', 'Urgente', 'a,b', ''])).toEqual(['Feira de março', 'Urgente', 'a b']);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(LeadUpdateSchema.parse({ tags: ['VIP', 'vip'] }).tags).toEqual(['VIP']);
    expect(LeadUpdateSchema.safeParse({ tags: ['x'.repeat(31)] }).success).toBe(false);
    expect(LeadListQuerySchema.parse({ tag: 'feira,urgente' }).tag).toEqual(['feira', 'urgente']);
  });
});

describe('limpeza de duplicados', () => {
  it('junta os pares em grupos (A=B e B=C → A, B, C) com os motivos', () => {
    const groups = groupDuplicatePairs([
      { lead_a: 'a', lead_b: 'b', reason: 'email' },
      { lead_a: 'b', lead_b: 'c', reason: 'name' },
      { lead_a: 'x', lead_b: 'y', reason: 'website' },
    ]);
    expect(groups).toEqual(
      expect.arrayContaining([
        { ids: ['a', 'b', 'c'], reasons: ['email', 'name'] },
        { ids: ['x', 'y'], reasons: ['website'] },
      ]),
    );
  });

  it('o principal é o mais avançado no pipeline; em empate o mais antigo; arquivados por último', () => {
    const lead = (id: string, number: number, status: 'identificado' | 'cliente' | 'contactado', archived_at: string | null = null) => ({ id, number, status, archived_at });
    expect(pickPrimary([lead('a', 1, 'identificado'), lead('b', 9, 'cliente')]).id).toBe('b');
    expect(pickPrimary([lead('a', 5, 'contactado'), lead('b', 2, 'contactado')]).id).toBe('b');
    expect(pickPrimary([lead('a', 1, 'cliente', '2026-01-01'), lead('b', 9, 'identificado')]).id).toBe('b');
  });
});

describe('agenda', () => {
  it('a semana começa à segunda e o calendário tem follow-ups', () => {
    expect(weekStart('2026-10-23')).toBe('2026-10-19'); // sexta → segunda
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(CALENDAR_EVENT_TYPES).toContain('followup');
  });
});

describe('notas de reunião com IA', () => {
  it('datas a partir de hoje, no máximo 6 tarefas, sem tarefas vazias', () => {
    const r = meetingNotesResult(
      {
        resumo: ' Querem loja online. ',
        tarefas: [{ titulo: 'Enviar proposta', prazo_dias: 3 }, { titulo: '  ', prazo_dias: 1 }, ...Array.from({ length: 8 }, (_, i) => ({ titulo: `T${i}`, prazo_dias: null }))],
        proximo_passo: { texto: 'Ligar', dias: 7 },
      },
      '2026-10-23',
      'claude',
    );
    expect(r.summary).toBe('Querem loja online.');
    expect(r.tasks).toHaveLength(6);
    expect(r.tasks[0]).toEqual({ title: 'Enviar proposta', due_on: '2026-10-26' });
    expect(r.tasks[1]!.due_on).toBeNull();
    expect(r.next_action).toEqual({ text: 'Ligar', on: '2026-10-30' });
  });
});

describe('ponto de situação', () => {
  it('o que foi feito desde o último, próximos passos, reunião, pagamento e link', () => {
    const { subject, body } = buildProjectUpdate({
      company: 'Padaria Sol',
      projectTitle: 'Loja online',
      contact: 'Marta Silva',
      since: '2026-10-20',
      tasks: [
        { title: 'Maquete', done_at: '2026-10-21T10:00:00Z', due_on: null },
        { title: 'Briefing', done_at: '2026-10-10T10:00:00Z', due_on: null },
        { title: 'Página de produtos', done_at: null, due_on: '2026-10-30' },
      ],
      deliverables: [{ title: 'Logótipo', status: 'aprovada', approved_at: '2026-10-22T10:00:00Z' }],
      meeting: { starts_at: '2026-10-28T14:30:00Z' },
      nextPayment: { description: 'Sinal', amount: 300, due_on: '2026-10-31' },
      shareUrl: 'https://leads.vndesign.pt/p/abc',
      signature: 'Vá\nVNDesign',
    });
    expect(subject).toBe('Ponto de situação — Loja online');
    expect(body).toContain('Olá Marta,');
    expect(body).toContain('desde 20/10/2026');
    expect(body).toContain('• Maquete');
    expect(body).not.toContain('• Briefing');
    expect(body).toContain('• Logótipo — aprovada');
    expect(body).toContain('• Página de produtos (até 30/10/2026)');
    expect(body).toContain('Próxima reunião: 28/10/2026 às 14:30');
    expect(body).toMatch(/Próximo pagamento: Sinal — 300\s€ até 31\/10\/2026/);
    expect(body).toContain('https://leads.vndesign.pt/p/abc');
    expect(body.endsWith('Vá\nVNDesign')).toBe(true);
  });
});
