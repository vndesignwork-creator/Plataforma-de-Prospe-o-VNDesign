/** Ditado por voz (botão 🎤): como juntar cada frase reconhecida ao texto. */

/** Junta o ditado ao texto com um espaço (começa com maiúscula se o texto estiver vazio ou acabar numa frase). */
export function appendDictation(current: string, spoken: string): string {
  const text = spoken.trim();
  if (!text) return current;
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  if (!current.trim()) return sentence;
  return /[.!?]\s*$/.test(current) ? `${current.trimEnd()} ${sentence}` : `${current.trimEnd()} ${text}`;
}

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * O que há de novo numa frase reconhecida, face ao que já entrou nesta sessão de ditado.
 * O Chrome do Android repete o que já foi dito ("olá" → "olá tudo" → "olá tudo bem") e às
 * vezes manda a mesma frase duas vezes: aí só entra o resto. Devolve o texto a juntar
 * ('' = nada) e o novo "já entrou".
 */
export function newDictationPart(committed: string, spoken: string): { add: string; committed: string } {
  const text = spoken.replace(/\s+/g, ' ').trim();
  if (!text) return { add: '', committed };
  const done = norm(committed);
  const now = norm(text);
  if (!done) return { add: text, committed: text };
  if (now === done || done.endsWith(now)) return { add: '', committed };
  if (now.startsWith(done)) {
    // Mesmo começo (cumulativo): só o resto, mantendo as letras como vieram.
    const rest = text.slice(text.length - (now.length - done.length)).trim();
    return { add: rest, committed: text };
  }
  return { add: text, committed: `${committed} ${text}` };
}
