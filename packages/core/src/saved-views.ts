/**
 * Filtros guardados na lista de leads ("Restaurantes em Lisboa sem site"):
 * cada pessoa guarda os seus (preferência "leads.views"), com um nome.
 */
import { z } from 'zod';

export const SAVED_VIEWS_PREFERENCE = 'leads.views';
export const SAVED_VIEWS_MAX = 20;

export const SavedViewSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1, { error: 'Dá um nome a estes filtros.' }).max(60, { error: 'Máximo de 60 caracteres.' }),
  /** Os filtros como estão no endereço (sem página). */
  query: z.string().max(2000),
});
export type SavedView = z.infer<typeof SavedViewSchema>;

export const SavedViewsSchema = z.array(SavedViewSchema).max(SAVED_VIEWS_MAX);

/** Parâmetros que não são filtros (página e coisas de passagem) ficam de fora. */
const IGNORED = new Set(['page', 'acao']);

/** Os filtros atuais, por ordem estável (para comparar e guardar). */
export function viewQuery(params: URLSearchParams | Record<string, string>): string {
  const entries = params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  return entries
    .filter(([k, v]) => !IGNORED.has(k) && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Guarda (ou substitui, pelo nome) um filtro; o mais recente primeiro, no máximo 20. */
export function upsertView(list: readonly SavedView[], name: string, query: string, id: string): SavedView[] {
  const clean = name.trim().slice(0, 60);
  const rest = list.filter((v) => v.name.toLowerCase() !== clean.toLowerCase());
  return [{ id, name: clean, query }, ...rest].slice(0, SAVED_VIEWS_MAX);
}
