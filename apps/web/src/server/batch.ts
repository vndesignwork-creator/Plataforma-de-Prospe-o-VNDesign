/**
 * Listas grandes de ids em `.in(...)` vão no URL do pedido ao PostgREST, que
 * recusa URLs demasiado compridos (414, "URI too long") a partir de ~200 ids.
 * `selectInBatches` faz a mesma consulta em lotes e junta as linhas.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { fromPostgrest } from './http';

export const IN_BATCH = 150;

export async function selectInBatches<T>(
  ids: readonly string[],
  query: (batch: string[]) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_BATCH) batches.push(unique.slice(i, i + IN_BATCH));
  const results = await Promise.all(batches.map((batch) => query(batch)));
  const rows: T[] = [];
  for (const r of results) {
    if (r.error) throw fromPostgrest(r.error);
    rows.push(...((r.data ?? []) as T[]));
  }
  return rows;
}

/**
 * O PostgREST devolve no máximo `max_rows` linhas por pedido (1000 no Supabase), por
 * mais alto que seja o `.limit()`: somar uma lista cortada dá números errados sem aviso.
 * `selectAllPages` pede página a página (`.range`) até vir uma incompleta. A consulta
 * tem de ter uma ordem estável (ex.: `.order('id')`) para as páginas não se repetirem.
 */
export const PAGE_SIZE = 1000;

export async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  max = 100_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw fromPostgrest(error);
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}
