import { describe, expect, it } from 'vitest';
import { newDictationPart } from './dictation';

function run(phrases: string[]) {
  let committed = '';
  const added: string[] = [];
  for (const p of phrases) {
    const r = newDictationPart(committed, p);
    committed = r.committed;
    if (r.add) added.push(r.add);
  }
  return added.join(' ');
}

describe('ditado: sem repetir palavras', () => {
  it('computador: frases separadas entram todas', () => {
    expect(run(['ligar à Marta', 'amanhã às dez'])).toBe('ligar à Marta amanhã às dez');
  });
  it('Android: frases cumulativas só juntam o resto', () => {
    expect(run(['olá', 'olá tudo', 'olá tudo bem'])).toBe('olá tudo bem');
  });
  it('Android: a mesma frase duas vezes entra uma vez', () => {
    expect(run(['querem loja online', 'querem loja online'])).toBe('querem loja online');
    expect(run(['ligar amanhã', 'amanhã'])).toBe('ligar amanhã');
  });
  it('maiúsculas e espaços não contam como diferença', () => {
    expect(run(['Olá', 'olá  Tudo bem'])).toBe('Olá Tudo bem');
  });
});
