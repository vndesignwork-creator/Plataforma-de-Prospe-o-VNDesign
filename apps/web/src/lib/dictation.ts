/** Ditado por voz (botão 🎤): como juntar cada frase reconhecida ao texto. */

/** Junta o ditado ao texto com um espaço (começa com maiúscula se o texto estiver vazio ou acabar numa frase). */
export function appendDictation(current: string, spoken: string): string {
  const text = spoken.trim();
  if (!text) return current;
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  if (!current.trim()) return sentence;
  return /[.!?]\s*$/.test(current) ? `${current.trimEnd()} ${sentence}` : `${current.trimEnd()} ${text}`;
}
