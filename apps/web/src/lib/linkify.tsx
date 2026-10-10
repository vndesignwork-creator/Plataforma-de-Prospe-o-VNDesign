import { Fragment } from 'react';

/**
 * Links escritos no texto (tarefas): "https://…", "www.…" ou um domínio com
 * extensão conhecida ("oquintal.pt/menu"). Só gera ligações http(s).
 */
const LINK_RE =
  /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:pt|com|net|org|eu|io|app|dev|co|br|es|fr|uk|de|info|biz|online|site|store|shop)\b(?:\/[^\s<>"']*)?/gi;
// Pontuação no fim que é da frase, não do link ("vê oquintal.pt.").
const TRAILING = /[.,;:!?)\]}'"»]+$/;

export type TextPart = { text: string; href?: string };

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index;
    // Um email (texto@dominio.pt) não é um link.
    if (start > 0 && text[start - 1] === '@') continue;
    let raw = match[0];
    const trailing = TRAILING.exec(raw)?.[0] ?? '';
    // Mantém ")" se o link tiver "(" (ex.: páginas da Wikipédia).
    raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: raw, href: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Texto com os links clicáveis (abrem num separador novo; o clique não chega ao que está por baixo). */
export function Linkified({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        p.href ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={className ?? 'text-accent-text underline underline-offset-2 [overflow-wrap:anywhere] hover:no-underline'}
          >
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
