import { describe, expect, it } from 'vitest';
import {
  REPLY_GOALS,
  REPLY_GOAL_INSTRUCTIONS,
  REPLY_TEXT_MAX,
  ReplyDraftRequestSchema,
  buildReplyPrompt,
  finalizeReply,
  type ReplyDraftRequest,
} from '../src/reply-draft';
import { AI_FUNCTIONS, aiFunctionSetting, type AiSettings } from '../src/ai-providers';

const request = (over: Partial<ReplyDraftRequest> = {}): ReplyDraftRequest =>
  ReplyDraftRequestSchema.parse({ text: 'Bom dia, quanto custa um site destes?', ...over });

const context = {
  lead: {
    company_name: 'Padaria Sol',
    contact_name: 'Ana',
    sector: 'Padarias',
    city: 'Braga',
    website: 'https://padariasol.pt',
    problems: 'Site lento no telemóvel',
    status: 'respondeu',
    services: ['Site institucional'],
    first_contact_on: '2026-11-02',
  },
  previousSubject: 'O site da Padaria Sol no telemóvel',
  auditIssues: ['Demora 8 segundos a abrir'],
  proposal: null,
  sender: { name: 'Va', company: 'VNDesign' },
};

describe('pedido de resposta', () => {
  it('exige o texto do lead', () => {
    expect(ReplyDraftRequestSchema.safeParse({ text: '' }).success).toBe(false);
    expect(ReplyDraftRequestSchema.safeParse({ text: 'a'.repeat(REPLY_TEXT_MAX + 1) }).success).toBe(false);
  });

  it('por omissão: responder, tom profissional', () => {
    const parsed = request();
    expect(parsed.goal).toBe('responder');
    expect(parsed.tone).toBe('profissional');
  });

  it('cada objetivo tem instrução própria', () => {
    for (const goal of REPLY_GOALS) expect(REPLY_GOAL_INSTRUCTIONS[goal].length).toBeGreaterThan(10);
  });
});

describe('pedido enviado à IA', () => {
  it('leva o que o lead escreveu entre marcas e os dados do lead', () => {
    const prompt = buildReplyPrompt(request(), context);
    expect(prompt).toContain('<resposta_do_lead>');
    expect(prompt).toContain('quanto custa um site destes?');
    expect(prompt).toContain('Negócio: Padaria Sol');
    expect(prompt).toContain('Da análise do site: Demora 8 segundos a abrir');
    expect(prompt).toContain('Assunto do email que lhe enviámos: O site da Padaria Sol no telemóvel');
  });

  it('inclui o que o dono quer dizer e o objetivo escolhido', () => {
    const prompt = buildReplyPrompt(request({ goal: 'agendar', notes: 'só tenho agenda em março' }), context);
    expect(prompt).toContain('só tenho agenda em março');
    expect(prompt).toContain('Propor uma chamada ou reunião');
  });
});

describe('resposta final', () => {
  it('junta a assinatura e põe "Re:" no assunto', () => {
    const final = finalizeReply(
      { body: 'Olá Ana,\n\n\n\nObrigado pela resposta.\n\nCumprimentos,', summary: '  Perguntou   o preço.  ', tip: 'Liga antes de enviar.' },
      'O site da Padaria Sol',
      'Va\nVNDesign',
    );
    expect(final.subject).toBe('Re: O site da Padaria Sol');
    expect(final.body).toBe('Olá Ana,\n\nObrigado pela resposta.\n\nCumprimentos,\n\nVa\nVNDesign');
    expect(final.summary).toBe('Perguntou o preço.');
    expect(final.tip).toBe('Liga antes de enviar.');
  });

  it('não empilha "Re: Re:" nem inventa dica', () => {
    const final = finalizeReply({ body: 'Olá,', summary: '', tip: '  ' }, 'Re: Pedido', '');
    expect(final.subject).toBe('Re: Pedido');
    expect(final.tip).toBeNull();
    expect(final.body).toBe('Olá,');
  });
});

describe('definições da IA', () => {
  it('a função "reply" existe e segue o Email com IA quando não tem escolha própria', () => {
    expect(AI_FUNCTIONS).toContain('reply');
    const ai = { email: { provider: 'anthropic', model: 'claude-opus-5-5' }, reply: null } as unknown as AiSettings;
    expect(aiFunctionSetting(ai, 'reply')).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' });
  });
});
