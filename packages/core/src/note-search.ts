/**
 * Pesquisa rápida (Ctrl+K) no texto das notas e das chamadas registadas:
 * "quem pediu loja online?" → o lead e um excerto da nota.
 */
import { z } from 'zod';

export const NoteSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2, { error: 'Escreve pelo menos 2 letras.' }).max(100).meta({ description: 'Texto a procurar nas notas e chamadas' }),
    limit: z.coerce.number().int().min(1).max(20).default(6),
  })
  .meta({ id: 'NoteSearchQuery' });
export type NoteSearchQuery = z.output<typeof NoteSearchQuerySchema>;

export const NoteSearchResultSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['note', 'call_logged']),
    body: z.string(),
    created_at: z.string(),
    lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), project_title: z.string().nullable() }),
  })
  .meta({ id: 'NoteSearchResult' });
export type NoteSearchResult = z.infer<typeof NoteSearchResultSchema>;

/**
 * Minúsculas e sem acentos, um carácter por carácter do texto (emojis viram
 * "�"), para as posições ficarem iguais às de Array.from(texto).
 */
function fold(text: string): string {
  return Array.from(text, (c) => {
    const f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return f.length === 1 ? f : '�';
  }).join('');
}

/**
 * Excerto à volta da primeira ocorrência (sem acentos nem maiúsculas), numa só
 * linha, com "…" quando corta. Sem ocorrência: o início do texto.
 */
export function noteSnippet(body: string, q: string, radius = 50): string {
  const text = Array.from(body.replace(/\s+/g, ' ').trim());
  const hay = fold(text.join(''));
  const needle = fold(q.replace(/\s+/g, ' ').trim());
  const at = needle ? hay.indexOf(needle) : -1;
  const start = at < 0 ? 0 : Math.max(0, at - radius);
  const end = at < 0 ? radius * 2 : Math.min(text.length, at + needle.length + radius);
  const cut = text.slice(start, end).join('').trim();
  return `${start > 0 ? '…' : ''}${cut}${end < text.length ? '…' : ''}`;
}
