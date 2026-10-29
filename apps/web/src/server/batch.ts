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
