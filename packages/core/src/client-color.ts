/**
 * Cor de cada cliente: uma barra fina à esquerda do projeto, sempre com a
 * mesma cor para o mesmo cliente, para se distinguirem de relance. A cor vem
 * do nome (não se guarda nada) e evita o laranja da marca, para não se
 * confundir com os botões.
 */

/** Tons escolhidos à mão (sem o laranja da marca): azul, verde, roxo, rosa… */
const HUES = [205, 160, 265, 320, 190, 135, 240, 290, 350, 175, 220, 110];

/** Soma estável dos caracteres (o mesmo nome dá sempre a mesma cor). */
function hash(text: string): number {
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum = (sum * 31 + text.charCodeAt(i)) >>> 0;
  return sum;
}

/**
 * A cor do cliente em CSS. `name` é o nome da empresa (ou do cliente); sem
 * nome fica cinzento (sem cor, para não inventar).
 */
export function clientColor(name: string | null | undefined): string | null {
  const clean = (name ?? '').trim().toLowerCase();
  if (!clean) return null;
  const hue = HUES[hash(clean) % HUES.length]!;
  // Discreta: pouca saturação, para marcar sem puxar o olho. Fixa, para se
  // ler no tema claro e no escuro.
  return `hsl(${hue} 38% 48%)`;
}
