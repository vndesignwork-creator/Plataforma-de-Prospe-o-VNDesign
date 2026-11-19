import { describe, expect, it } from 'vitest';
import {
  AB_ANGLES,
  AB_MIN_SENDS,
  AbVariantRequestSchema,
  abDiffWarning,
  abReadiness,
  buildAbPrompt,
  proportionsDiffer,
  textOverlap,
} from '../src/ab-test';

const side = (sent: number, opened: number, replied: number) => ({ sent, tracked: sent, opened, replied });

describe('pedido da versão B', () => {
  it('exige o texto da versão A', () => {
    expect(AbVariantRequestSchema.safeParse({ kind: 'cold_email', body: 'curto' }).success).toBe(false);
    expect(AbVariantRequestSchema.safeParse({ kind: 'cold_email', body: 'Olá {{contacto}}, uma ideia para si.' }).success).toBe(true);
  });

  it('leva o que muda e o formato', () => {
    const input = AbVariantRequestSchema.parse({ kind: 'cold_email', subject: 'Assunto A', body: 'Olá {{contacto}}, uma ideia.', angle: 'curto', rich: true });
    const prompt = buildAbPrompt(input);
    expect(prompt).toContain('<versao_a>');
    expect(prompt).toContain('Assunto: Assunto A');
    expect(prompt).toContain('metade do tamanho');
    expect(prompt).toContain('HTML simples');
  });

  it('todos os ângulos têm instrução própria', () => {
    for (const angle of AB_ANGLES) {
      const prompt = buildAbPrompt(AbVariantRequestSchema.parse({ kind: 'cold_email', body: 'Olá {{contacto}}, uma ideia.', angle }));
      expect(prompt.split('O que mudar: ')[1]!.length).toBeGreaterThan(20);
    }
  });
});

describe('quando o resultado já conta', () => {
  it('com poucos envios diz que ainda não dá', () => {
    const r = abReadiness(side(10, 5, 2), side(12, 3, 0));
    expect(r.conclusive).toBe(false);
    expect(r.message).toContain(`de ${AB_MIN_SENDS}`);
  });

  it('com diferença clara nas respostas aponta o vencedor', () => {
    const r = abReadiness(side(200, 100, 40), side(200, 95, 8));
    expect(r.conclusive).toBe(true);
    expect(r.leader).toBe('A');
    expect(r.message).toContain('respostas');
  });

  it('empate com muitos envios sugere mudar outra coisa', () => {
    const r = abReadiness(side(200, 100, 20), side(200, 101, 21));
    expect(r.conclusive).toBe(false);
    expect(r.message).toContain('o mesmo');
  });

  it('diferenças pequenas não contam como vencedor', () => {
    expect(proportionsDiffer(31, 100, 35, 100)).toBe(false);
    expect(proportionsDiffer(20, 100, 50, 100)).toBe(true);
    // Poucos envios nunca concluem, por maior que pareça a diferença.
    expect(proportionsDiffer(0, 10, 5, 10)).toBe(false);
  });
});

describe('mudar uma coisa de cada vez', () => {
  const a = 'Olá {{contacto}}, vi o site da {{empresa}} e reparei que demora a abrir no telemóvel. Posso enviar um relatório curto?';

  it('avisa quando as duas versões são iguais', () => {
    expect(abDiffWarning(a, a)).toContain('praticamente iguais');
  });

  it('avisa quando mudou quase tudo', () => {
    expect(abDiffWarning(a, 'Bom dia. Trabalho com lojas online e queria apresentar-lhe os meus serviços de design gráfico e vídeo.')).toContain('muito diferentes');
  });

  it('não avisa quando só mudou uma parte', () => {
    expect(abDiffWarning(a, 'Olá {{contacto}}, vi o site da {{empresa}} e reparei que demora a abrir no telemóvel. Quer que lhe diga o que encontrei?')).toBeNull();
  });

  it('o texto em comum ignora o HTML', () => {
    expect(textOverlap('<p>Olá {{contacto}}</p>', 'Olá {{contacto}}')).toBe(1);
  });
});
