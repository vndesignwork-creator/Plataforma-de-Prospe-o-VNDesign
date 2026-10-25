/**
 * O que se lê no texto dos emails recebidos (deteção de respostas):
 *  - avisos de devolução ("Undelivered Mail…"): a que endereço não chegou;
 *  - respostas de leads: "não tenho interesse" / "removam-me" (só o texto novo,
 *    sem a mensagem citada);
 *  - respostas automáticas de ausência: até quando a pessoa está fora.
 * Tudo por regras simples (sem IA): o resultado vê-se e anula-se na ficha.
 */
import { addDays } from './format';

const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/i;
const BOUNCE_SUBJECT =
  /(undeliver|delivery status notification \((failure|falha)\)|delivery (has )?failed|mail delivery (failed|subsystem)|returned mail|failure notice|n[aã]o (foi )?entregue|falha (na|de) entrega|mensagem n[aã]o entregue|address not found)/i;

/** Aviso de devolução (o servidor de email não conseguiu entregar). */
export function isBounce(from: string, subject: string): boolean {
  return BOUNCE_SENDER.test(from.trim()) || BOUNCE_SUBJECT.test(subject);
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Os endereços a que o email não chegou: as linhas "Final-Recipient" /
 * "Original-Recipient" do relatório; sem relatório, os endereços do texto
 * (menos os do servidor que avisa).
 */
export function bounceRecipients(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/^(?:final|original)-recipient:\s*(?:rfc822;)?\s*<?([^\s>;]+@[^\s>;]+)>?/gim)) {
    out.add(m[1]!.toLowerCase());
  }
  if (out.size) return [...out];
  for (const m of text.matchAll(EMAIL)) {
    const email = m[0].toLowerCase().replace(/\.$/, '');
    if (!BOUNCE_SENDER.test(email)) out.add(email);
  }
  return [...out];
}

/** O Message-ID do email original, quando vem citado no aviso (para o ligar ao email enviado). */
export function bouncedMessageId(text: string): string | null {
  return /^message-id:\s*(<[^>\s]+>)/im.exec(text)?.[1] ?? null;
}

/** O texto novo de uma resposta: corta a mensagem citada ("Em … escreveu:", "> …", "De: …"). */
export function replyBody(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (
      /^(em|on|le|el)\s.+(escreveu|wrote|a écrit|escribió)\s*:?\s*$/i.test(t) ||
      /^-{2,}\s*(original message|mensagem original|forwarded message|mensagem reencaminhada)/i.test(t) ||
      /^(de|from)\s*:\s*.+@/i.test(t) ||
      /^_{5,}$/.test(t)
    ) {
      break;
    }
    if (t.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

export type ReplyIntent = 'unsubscribe' | 'not_interested' | null;

const UNSUBSCRIBE =
  /(remov[ae](m)?(-me| o meu (email|contacto)| os meus dados)|n[aã]o (me|nos) (voltem? a )?(contact|envi|mand)|deixar de receber|apaguem os meus dados|unsubscribe|remove me|stop (emailing|sending))/i;
const NOT_INTERESTED =
  /(n[aã]o (estou|estamos|tenho|temos) (qualquer |nenhum )?(interess|necessidade)|sem interesse|n[aã]o (nos |me )?interessa|n[aã]o precis(o|amos)|j[aá] (temos|tenho) (site|quem|um fornecedor|empresa)|n[aã]o pretend(o|emos)|not interested|no thanks|n[aã]o,? obrigad[oa])/i;

/** "Removam-me" (→ Não contactar) ou "não tenho interesse" (→ Sem interesse), no texto novo da resposta. */
export function replyIntent(text: string): ReplyIntent {
  const body = replyBody(text).slice(0, 2000);
  if (!body) return null;
  if (UNSUBSCRIBE.test(body)) return 'unsubscribe';
  if (NOT_INTERESTED.test(body)) return 'not_interested';
  return null;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1, january: 1,
  fevereiro: 2, fev: 2, february: 2, feb: 2,
  março: 3, marco: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  maio: 5, mai: 5, may: 5,
  junho: 6, jun: 6, june: 6,
  julho: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  setembro: 9, set: 9, september: 9, sep: 9,
  outubro: 10, out: 10, october: 10, oct: 10,
  novembro: 11, nov: 11, november: 11,
  dezembro: 12, dez: 12, december: 12, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Uma data (dia e mês) a partir de hoje: sem ano, é a próxima vez que esse dia chega. */
function dateFrom(day: number, month: number, year: number | null, today: string): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  let y = year ?? Number(today.slice(0, 4));
  if (y < 100) y += 2000;
  let iso = `${y}-${pad(month)}-${pad(day)}`;
  if (!year && iso < today) iso = `${y + 1}-${pad(month)}-${pad(day)}`;
  const check = new Date(`${iso}T12:00:00Z`);
  return check.getUTCDate() === day ? iso : null;
}

/**
 * Resposta automática de ausência: o dia em que a pessoa volta ("regresso a
 * 3/11", "estarei fora até dia 3 de novembro", "back on November 3"). Só datas
 * de hoje até daqui a 60 dias; senão null.
 */
export function outOfOfficeReturn(text: string, today: string): string | null {
  const t = replyBody(text).slice(0, 2000).toLowerCase();
  const near = /(regress|volt|retom|de volta|fora|ausente|aus[eê]ncia|f[eé]rias|até|ate|back|return|until|away|out of (the )?office)/;
  const candidates: string[] = [];
  for (const m of t.matchAll(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/g)) {
    const before = t.slice(Math.max(0, m.index! - 60), m.index!);
    if (!near.test(before)) continue;
    const iso = dateFrom(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, today);
    if (iso) candidates.push(iso);
  }
  for (const m of t.matchAll(/(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\.?(?:\s+(?:de\s+)?(\d{4}))?/g)) {
    const month = MONTHS[m[2]!];
    if (!month) continue;
    const before = t.slice(Math.max(0, m.index! - 60), m.index!);
    if (!near.test(before)) continue;
    const iso = dateFrom(Number(m[1]), month, m[3] ? Number(m[3]) : null, today);
    if (iso) candidates.push(iso);
  }
  // "November 10" (inglês: o mês primeiro).
  for (const m of t.matchAll(/([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/g)) {
    const month = MONTHS[m[1]!];
    if (!month) continue;
    const before = t.slice(Math.max(0, m.index! - 60), m.index!);
    if (!near.test(before)) continue;
    const iso = dateFrom(Number(m[2]), month, m[3] ? Number(m[3]) : null, today);
    if (iso) candidates.push(iso);
  }
  const limit = addDays(today, 60);
  const valid = candidates.filter((d) => d >= today && d <= limit).sort();
  // Várias datas ("de 20/10 a 3/11"): conta a última (o regresso).
  return valid.at(-1) ?? null;
}
