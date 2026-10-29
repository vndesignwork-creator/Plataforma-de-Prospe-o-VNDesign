/**
 * Texto formatado dos emails (editor com negrito, listas, links…). A mensagem
 * pode estar em texto simples (modelos, IA, emails antigos) ou em HTML do editor.
 * O HTML passa sempre por `sanitizeRichHtml` (só as etiquetas do editor, sem
 * atributos além do link e do alinhamento) antes de ser mostrado ou enviado.
 */
import { plainTextToHtml } from './mail';

const ALLOWED = new Set(['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li', 'blockquote', 'a']);
const ALIGNABLE = new Set(['p', 'div', 'li']);
const RICH_TAG = /<(p|div|br|b|strong|i|em|u|s|strike|ul|ol|li|blockquote|a)\b[^>]*>/i;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeAttr = (s: string) => s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A mensagem tem formatação do editor (HTML)? */
export function isRichHtml(value: string | null | undefined): boolean {
  return RICH_TAG.test(value ?? '');
}

/** Só as etiquetas do editor; tudo o resto sai (o texto lá dentro fica). */
export function sanitizeRichHtml(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|title|template|iframe|object|svg|math|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|head|title|template|iframe|object|svg|math|noscript)\b[^>]*>/gi, '');
  return cleaned
    .split(/(<[^>]*>)/g)
    .map((part) => {
      if (!part.startsWith('<')) return part.replace(/</g, '&lt;');
      const m = /^<\s*(\/?)\s*([a-z0-9]+)\b([^>]*)>$/i.exec(part);
      if (!m) return '';
      const closing = m[1] === '/';
      const tag = m[2]!.toLowerCase();
      if (!ALLOWED.has(tag)) return '';
      if (tag === 'br') return closing ? '' : '<br>';
      if (closing) return `</${tag}>`;
      const attrs = m[3] ?? '';
      if (tag === 'a') {
        const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
        const url = (href?.[2] ?? href?.[3] ?? href?.[4] ?? '').trim().replace(/&amp;/g, '&');
        return /^(https?:\/\/|mailto:)/i.test(url) ? `<a href="${escapeAttr(url)}">` : '<a>';
      }
      if (ALIGNABLE.has(tag)) {
        const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(attrs);
        if (align) return `<${tag} style="text-align:${align[1]!.toLowerCase()}">`;
      }
      return `<${tag}>`;
    })
    .join('');
}

/** Um pedaço de texto simples dentro de HTML do editor: escapado, com links e quebras de linha. */
export function richInline(text: string): string {
  return escapeHtml(text)
    .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(/\r?\n/g, '<br>');
}

/** Texto simples → HTML do editor (parágrafos, quebras de linha e links). */
export function textToRichHtml(text: string): string {
  const paragraphs = text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  if (!paragraphs[0]) return '<p><br></p>';
  return paragraphs.map((p) => `<p>${richInline(p)}</p>`).join('');
}

/** Qualquer mensagem (texto ou HTML) → HTML seguro para o editor. */
export function toRichHtml(value: string | null | undefined): string {
  const v = value ?? '';
  return isRichHtml(v) ? sanitizeRichHtml(v) : textToRichHtml(v);
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** HTML do editor → texto simples (WhatsApp, "Abrir no email", parte de texto do email, exportar). */
export function richToPlainText(html: string): string {
  let s = sanitizeRichHtml(html);
  // Listas numeradas: 1. 2. 3.; com pontos: "- ".
  s = s.replace(/<ol>([\s\S]*?)<\/ol>/g, (_m, inner: string) => {
    let n = 0;
    return `\n${inner.replace(/<\/li>/g, '').replace(/<li[^>]*>/g, () => `\n${++n}. `)}\n`;
  });
  s = s.replace(/<ul>([\s\S]*?)<\/ul>/g, (_m, inner: string) => `\n${inner.replace(/<\/li>/g, '').replace(/<li[^>]*>/g, '\n- ')}\n`);
  s = s
    .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]*>/g, '').trim();
      const url = decodeEntities(href).replace(/^mailto:/, '');
      return !text || text === url || decodeEntities(text) === url ? url : `${text} (${url})`;
    })
    .replace(/<br>/g, '\n')
    .replace(/<blockquote>/g, '\n> ')
    .replace(/<\/(p|div|blockquote|li)>/g, '\n')
    .replace(/<(p|div)[^>]*>/g, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(s)
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Qualquer mensagem → texto simples. */
export function toPlainText(value: string | null | undefined): string {
  const v = value ?? '';
  return isRichHtml(v) ? richToPlainText(v) : v;
}

/** Qualquer mensagem → HTML do email enviado (com espaçamento entre parágrafos, como nos emails em texto). */
export function emailBodyHtml(value: string): string {
  if (!isRichHtml(value)) return plainTextToHtml(value);
  return sanitizeRichHtml(value)
    .replace(/<p>/g, '<p style="margin:0 0 1em">')
    .replace(/<p style="text-align:(\w+)">/g, '<p style="margin:0 0 1em;text-align:$1">')
    .replace(/<blockquote>/g, '<blockquote style="margin:0 0 1em;padding-left:12px;border-left:3px solid #ddd;color:#555">')
    .replace(/<(ul|ol)>/g, '<$1 style="margin:0 0 1em;padding-left:24px">');
}
