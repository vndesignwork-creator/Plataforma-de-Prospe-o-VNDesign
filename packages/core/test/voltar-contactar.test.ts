import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_CARDS,
  LeadTextInputSchema,
  LeadUpdateSchema,
  NO_ANSWER_LIMIT,
  ProspectingOutcomeSchema,
  arrangeKeys,
  buildNotificationsEmail,
  buildReconnectEmail,
  buildVCard,
  countAttempts,
  monthsBetween,
  retryDate,
  vCardFileName,
} from '../src';

describe('tentativas na Prospeção', () => {
  it('conta "Não atendeu", "Contactado" e as vezes seguidas sem resposta', () => {
    expect(countAttempts([])).toEqual({ no_answer: 0, contacted: 0, no_answer_streak: 0 });
    expect(countAttempts(['no_answer', 'contacted', 'no_answer', 'no_answer'])).toEqual({ no_answer: 3, contacted: 1, no_answer_streak: 2 });
    // Outro resultado (Mais tarde, Interessado) também corta a série.
    expect(countAttempts(['no_answer', 'no_answer', 'later', 'no_answer']).no_answer_streak).toBe(1);
    expect(NO_ANSWER_LIMIT).toBe(3);
  });

  it('"Sem interesse" com motivo e data de voltar a tentar', () => {
    const v = ProspectingOutcomeSchema.parse({ outcome: 'not_interested', lost_reason: 'agora_nao', retry_on: '2027-01-24' });
    expect(v.retry_on).toBe('2027-01-24');
    expect(ProspectingOutcomeSchema.safeParse({ outcome: 'not_interested', retry_on: '24/01/2027' }).success).toBe(false);
    expect(LeadUpdateSchema.parse({ retry_on: '2027-01-24' }).retry_on).toBe('2027-01-24');
  });
});

describe('"Agora não" volta sozinho', () => {
  it('daqui a N meses (fim do mês quando o dia não existe)', () => {
    expect(retryDate('2026-10-24', 3)).toBe('2027-01-24');
    expect(retryDate('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('clientes antigos', () => {
  it('meses entre datas', () => {
    expect(monthsBetween('2026-01-15T10:00:00Z', '2026-10-24')).toBe(9);
    expect(monthsBetween('2026-01-25', '2026-10-24')).toBe(8);
  });

  it('email pronto com o último projeto e a assinatura', () => {
    const { subject, body } = buildReconnectEmail({
      company: 'Café Central',
      contact: 'Rita Sousa',
      lastProject: 'Site novo',
      completedAt: '2026-01-10T12:00:00Z',
      today: '2026-10-24',
      signature: 'Va\nVNDesign',
    });
    expect(subject).toBe('Como está a correr? — Café Central');
    expect(body).toMatch(/^Olá Rita,/);
    expect(body).toContain('Já passaram 9 meses desde que terminámos o projeto Site novo');
    expect(body.endsWith('Va\nVNDesign')).toBe(true);
    expect(buildReconnectEmail({ company: 'X', contact: null, lastProject: null, completedAt: '2024-01-01', today: '2026-10-24', signature: null }).body).toContain(
      'Já passou mais de 2 anos desde que terminámos o nosso último projeto',
    );
  });
});

describe('novo lead por texto', () => {
  it('texto obrigatório', () => {
    expect(LeadTextInputSchema.safeParse({ text: 'oi' }).success).toBe(false);
    expect(LeadTextInputSchema.parse({ text: '  Padaria Estrela no Porto  ' }).text).toBe('Padaria Estrela no Porto');
  });
});

describe('guardar contacto (vCard)', () => {
  it('pessoa, empresa, telefone, email, site e morada', () => {
    const v = buildVCard({
      company_name: 'Padaria Estrela, Lda',
      contact_name: 'Ana Ribeiro',
      phone: '+351 912 345 678',
      email: 'ana@padaria.pt',
      website: 'padaria.pt',
      address: 'Rua das Flores, 10',
      city: 'Porto',
      number: 12,
    });
    expect(v).toContain('FN:Ana Ribeiro (Padaria Estrela\\, Lda)');
    expect(v).toContain('N:Ribeiro;Ana;;;');
    expect(v).toContain('TEL;TYPE=WORK,VOICE:+351912345678');
    expect(v).toContain('URL:https://padaria.pt');
    expect(v).toContain('ADR;TYPE=WORK:;;Rua das Flores\\, 10;Porto;;;Portugal');
    expect(v.startsWith('BEGIN:VCARD\r\n')).toBe(true);
    expect(vCardFileName('Café & Companhia')).toBe('Cafe-Companhia.vcf');
  });

  it('sem pessoa: o nome é o da empresa', () => {
    const v = buildVCard({ company_name: 'Oficina Rui', contact_name: null, phone: '912345678', email: null, website: null, address: null, city: null });
    expect(v).toContain('FN:Oficina Rui');
    expect(v).not.toContain('EMAIL');
  });
});

describe('cartões do Dashboard', () => {
  it('ordem escolhida e os novos no sítio de sempre', () => {
    // Ordem guardada antes de existir o cartão "Clientes antigos": entra a seguir aos Projetos.
    expect(arrangeKeys(DASHBOARD_CARDS, { order: ['hot', 'today', 'summary', 'projects', 'pipeline'] })).toEqual([
      'hot',
      'today',
      'summary',
      'projects',
      'reconnect',
      'pipeline',
    ]);
    const partial = arrangeKeys(DASHBOARD_CARDS, { order: ['hot', 'today'] });
    expect(partial.indexOf('hot')).toBeLessThan(partial.indexOf('today'));
    expect(new Set(partial).size).toBe(DASHBOARD_CARDS.length);
  });
});

describe('avisos por email', () => {
  it('lista os avisos com o lead e o link', () => {
    const mail = buildNotificationsEmail({
      name: 'Tânia Silva',
      appUrl: 'https://leads.vndesign.pt',
      items: [
        { kind: 'task_assigned', text: 'Ligar ao dono', created_at: '2026-10-24T10:00:00Z', actor: 'Va', lead: { number: 7, company_name: 'Café', url: 'https://leads.vndesign.pt/leads/7-cafe' } },
        { kind: 'mention', text: '@Tânia liga tu', created_at: '2026-10-24T11:00:00Z', actor: null, lead: null },
      ],
    });
    expect(mail.subject).toBe('Tens 2 avisos na VNDesign Leads');
    expect(mail.text).toContain('Olá Tânia,');
    expect(mail.text).toContain('• Va deu-te uma tarefa: “Ligar ao dono”');
    expect(mail.text).toContain('#7 Café — https://leads.vndesign.pt/leads/7-cafe');
    expect(mail.text).toContain('• Alguém mencionou-te: “@Tânia liga tu”');
  });
});
