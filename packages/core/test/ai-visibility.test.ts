import { describe, expect, it } from 'vitest';
import { AiVisibilityRequestSchema, defaultVisibilityQuestions, matchVisibility, parseVisibilityAnswers, visibilitySummary } from '../src';

describe('Aparece nas IAs?', () => {
  it('perguntas sugeridas a partir do setor e da cidade', () => {
    expect(defaultVisibilityQuestions({ sector: 'Construção', city: 'Lisboa' })[0]).toBe('Quais são as melhores empresas de construção em Lisboa?');
    expect(defaultVisibilityQuestions({ sector: null, city: null })[0]).toBe('Que empresas recomendas perto de mim?');
    expect(AiVisibilityRequestSchema.safeParse({ questions: [] }).success).toBe(false);
    expect(AiVisibilityRequestSchema.safeParse({ questions: Array(6).fill('Pergunta comprida o bastante') }).success).toBe(false);
  });

  const questions = ['Que construtoras recomendas em Lisboa?', 'Quem faz remodelações em Cascais?', 'Empreiteiro de confiança em Oeiras?'];
  const raw = {
    respostas: [
      { pergunta: questions[0], resposta: 'Recomendo a Obras Lda e a Casa Nova.', empresas: [{ nome: 'Obras, Lda.', site: 'https://obras.pt' }, { nome: 'Casa Nova', site: null }] },
      // A IA trocou a ordem destas duas: encontra-se pela pergunta.
      { pergunta: questions[2], resposta: 'A Obras Lda tem boas avaliações.', empresas: [{ nome: 'Obras Lda', site: 'http://www.obras.pt/' }] },
      { pergunta: questions[1], resposta: 'A API Construções é uma boa opção.', empresas: [{ nome: 'Remodela+', site: null }, { nome: 'API Construções — Relações construtivas', site: null }] },
    ],
  };

  it('lê as respostas (pela pergunta, se vierem trocadas) e encontra o lead pelo nome ou site', () => {
    const answers = parseVisibilityAnswers(raw, questions);
    expect(answers.map((a) => a.companies.length)).toEqual([2, 2, 1]);
    const m = matchVisibility(answers, { company_name: 'API Construções', website: 'https://apiconstrucoes.pt' });
    expect(m.results.map((r) => [r.mentioned, r.position])).toEqual([[false, null], [true, 2], [false, null]]);
    expect(m.mentioned_count).toBe(1);
    // A mesma empresa (mesmo site) conta uma vez, com o total de respostas.
    expect(m.competitors[0]).toEqual({ name: 'Obras, Lda.', website: 'https://obras.pt', count: 2 });
    expect(m.competitors.map((c) => c.name)).not.toContain('API Construções — Relações construtivas');
  });

  it('pelo site, mesmo com outro nome', () => {
    const m = matchVisibility(parseVisibilityAnswers(raw, questions), { company_name: 'Outro Nome', website: 'obras.pt' });
    expect(m.results.map((r) => r.position)).toEqual([1, null, 1]);
  });

  it('resumo para o cliente', () => {
    const answers = parseVisibilityAnswers(raw, questions);
    const none = matchVisibility(answers, { company_name: 'Ninguém Conhece', website: null });
    expect(visibilitySummary({ assistant: 'ChatGPT', questions, ...none })).toBe(
      'Quando se pergunta ao ChatGPT “Que construtoras recomendas em Lisboa?”, aparecem Obras, Lda., Casa Nova e Remodela+ — a sua empresa não aparece em nenhuma das 3 respostas.',
    );
    const some = matchVisibility(answers, { company_name: 'API Construções', website: null });
    expect(visibilitySummary({ assistant: 'Claude', questions, ...some })).toBe(
      'A sua empresa aparece em 1 de 3 respostas do Claude; nas outras aparecem Obras, Lda., Casa Nova e Remodela+.',
    );
  });

  it('resposta vazia ou estragada não rebenta', () => {
    expect(parseVisibilityAnswers(null, questions).every((a) => a.companies.length === 0 && a.answer === '')).toBe(true);
  });
});
