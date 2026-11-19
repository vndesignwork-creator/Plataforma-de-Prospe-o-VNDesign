import { describe, expect, it } from 'vitest';
import { CaseStudyRequestSchema, buildCaseStudyPrompt, caseStudyText, type CaseStudyContext } from '../src/case-study';

const context: CaseStudyContext = {
  company: 'Padaria Sol',
  sector: 'Padarias',
  city: 'Braga',
  services: ['Sites Institucionais'],
  problems: 'Site lento no telemóvel',
  auditIssues: ['Demora 8 segundos a abrir'],
  pagespeedBefore: 32,
  pagespeedAfter: 88,
  mobileBefore: 'Não adaptado',
  deliverables: ['Homepage', 'Página de contactos'],
  revisions: 2,
  hours: 14.5,
  value: '1 200,00 €',
  startedOn: '2026-01-10',
  completedOn: '2026-03-02',
  testimonial: { quote: 'Ficou muito melhor.', author: 'Ana', rating: 5 },
};

describe('pedido do caso de estudo', () => {
  it('por omissão: tom profissional e com o nome do cliente', () => {
    const parsed = CaseStudyRequestSchema.parse({});
    expect(parsed).toEqual({ tone: 'profissional', anonymous: false, notes: '' });
  });
});

describe('o que vai para a IA', () => {
  it('leva os dados do projeto entre marcas', () => {
    const prompt = buildCaseStudyPrompt(CaseStudyRequestSchema.parse({}), context);
    expect(prompt).toContain('<projeto>');
    expect(prompt).toContain('Cliente: Padaria Sol');
    expect(prompt).toContain('Velocidade antes (PageSpeed telemóvel): 32');
    expect(prompt).toContain('Velocidade depois (PageSpeed telemóvel): 88');
    expect(prompt).toContain('Entregas aprovadas: Homepage; Página de contactos');
    expect(prompt).toContain('Testemunho do cliente: "Ficou muito melhor."');
  });

  it('sem nome do cliente, o nome não vai no pedido', () => {
    const prompt = buildCaseStudyPrompt(CaseStudyRequestSchema.parse({ anonymous: true }), context);
    expect(prompt).not.toContain('Padaria Sol');
    expect(prompt).toContain('Setor: Padarias');
    expect(prompt).toContain('Zona: Braga');
  });

  it('o que se quer destacar vai junto', () => {
    const prompt = buildCaseStudyPrompt(CaseStudyRequestSchema.parse({ notes: 'as encomendas por WhatsApp' }), context);
    expect(prompt).toContain('A destacar: as encomendas por WhatsApp');
  });
});

describe('texto para copiar', () => {
  it('sai com as secções pela ordem e o testemunho no fim', () => {
    const text = caseStudyText({
      title: 'Site novo para a Padaria Sol',
      summary: 'Resumo.',
      challenge: 'O desafio era este.',
      work: ['Site novo', 'Fotografias'],
      result: 'Ficou assim.',
      quote: 'Ficou muito melhor.',
      quote_author: 'Ana',
    });
    expect(text.split('\n')[0]).toBe('Site novo para a Padaria Sol');
    expect(text).toContain('O desafio\nO desafio era este.');
    expect(text).toContain('• Site novo');
    expect(text.trimEnd().endsWith('"Ficou muito melhor." — Ana')).toBe(true);
  });

  it('sem testemunho não inventa aspas', () => {
    const text = caseStudyText({ title: 'T', summary: 'S', challenge: 'C', work: [], result: 'R', quote: null, quote_author: null });
    expect(text).not.toContain('"');
  });
});
