import { describe, expect, it } from 'vitest';
import { LOST_REASON_LABELS, LeadBulkActionSchema, LeadListQuerySchema, LeadUpdateSchema, WELCOME_TEMPLATE, buildWelcomeEmail } from '../src';

describe('Motivo de "Sem interesse"', () => {
  it('aceita os motivos conhecidos (e null) e recusa outros', () => {
    expect(LeadUpdateSchema.parse({ lost_reason: 'preco' }).lost_reason).toBe('preco');
    expect(LeadUpdateSchema.parse({ lost_reason: null }).lost_reason).toBeNull();
    expect(LeadUpdateSchema.safeParse({ lost_reason: 'caro' }).success).toBe(false);
    expect(Object.keys(LOST_REASON_LABELS)).toEqual(['preco', 'ja_tem_site', 'agora_nao', 'nao_responde', 'outro']);
  });

  it('filtro por motivo (com "none") e motivo nas ações em massa', () => {
    expect(LeadListQuerySchema.parse({ lost: 'preco,none' }).lost).toEqual(['preco', 'none']);
    expect(LeadListQuerySchema.safeParse({ lost: 'caro' }).success).toBe(false);
    const bulk = LeadBulkActionSchema.parse({ action: 'status', ids: ['8f0c3a52-6b8e-4f43-9a51-3a1f0b7d2c11'], status: 'sem_interesse', lost_reason: 'agora_nao' });
    expect(bulk.lost_reason).toBe('agora_nao');
  });
});

describe('Parados na fase', () => {
  it('"stale" em dias (1 a 365)', () => {
    expect(LeadListQuerySchema.parse({ stale: '14' }).stale).toBe(14);
    expect(LeadListQuerySchema.safeParse({ stale: '0' }).success).toBe(false);
    expect(LeadListQuerySchema.safeParse({ stale: '400' }).success).toBe(false);
  });
});

describe('Boas-vindas ao novo cliente', () => {
  const base = {
    company: 'Café Central',
    projectTitle: null,
    contact: 'Ana Silva',
    dueOn: null,
    tasks: [],
    payments: [],
    meeting: null,
    shareUrl: null,
    briefingUrl: null,
    signature: null,
  };

  it('com briefing, reunião, tarefas, entrega, pagamentos e página', () => {
    const { subject, body } = buildWelcomeEmail({
      ...base,
      projectTitle: 'Site novo',
      dueOn: '2026-12-15',
      tasks: [
        { title: 'Enviar textos', done_at: null, due_on: '2026-11-05' },
        { title: 'Já feita', done_at: '2026-10-20T10:00:00Z', due_on: null },
      ],
      payments: [
        { description: 'Adjudicação (50%)', amount: 600, due_on: '2026-11-01', paid_on: null },
        { description: 'Pago', amount: 100, due_on: null, paid_on: '2026-10-01' },
      ],
      meeting: { starts_at: '2026-11-03T10:30:00Z' },
      shareUrl: 'https://leads.vndesign.pt/p/abc',
      briefingUrl: 'https://leads.vndesign.pt/b/xyz',
      signature: 'Va\nVNDesign',
    });
    expect(subject).toBe(`${WELCOME_TEMPLATE} — Site novo`);
    expect(body).toMatch(/^Olá Ana,/);
    expect(body).toContain('projeto Site novo (Café Central)');
    expect(body).toContain('briefing (10 minutos, pode juntar logótipos e fotografias): https://leads.vndesign.pt/b/xyz');
    expect(body).toContain('reunião de arranque: 03/11/2026 às 10:30');
    expect(body).toContain('• Enviar textos (até 05/11/2026)');
    expect(body).not.toContain('Já feita');
    expect(body).toContain('Entrega prevista: 15/12/2026.');
    expect(body).toContain('• Adjudicação (50%) — 600');
    expect(body).not.toContain('• Pago');
    expect(body).toContain('nesta página: https://leads.vndesign.pt/p/abc');
    expect(body.trim().endsWith('Va\nVNDesign')).toBe(true);
  });

  it('sem nada preparado: pede os conteúdos', () => {
    const { subject, body } = buildWelcomeEmail({ ...base, contact: null });
    expect(subject).toBe(`${WELCOME_TEMPLATE} — Café Central`);
    expect(body).toMatch(/^Boa tarde,/);
    expect(body).toContain('Envie-me os conteúdos que já tiver');
    expect(body).not.toContain('Pagamentos:');
    expect(body).not.toContain('Entrega prevista');
  });
});
