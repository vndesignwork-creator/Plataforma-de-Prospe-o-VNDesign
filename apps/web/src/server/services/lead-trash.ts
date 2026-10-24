/**
 * Reciclagem: os leads apagados (com tudo o que tinham) ficam 30 dias e podem
 * ser repostos. Depois apagam-se de vez, com os ficheiros do kit da marca e do
 * briefing. Só o dono ou um administrador (RLS is_workspace_staff).
 */
import { TRASH_DAYS, addDays, todayIso, trashFilePaths, type TrashItem } from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';

type Row = Omit<TrashItem, 'items' | 'purge_on' | 'status'> & { status: TrashItem['status']; snapshot: { children?: Record<string, unknown[]> } };

export async function listTrash(ctx: ApiContext): Promise<TrashItem[]> {
  const { data, error } = await ctx.supabase
    .from('lead_trash')
    .select('id, lead_id, number, company_name, status, deleted_at, deleted_by, snapshot')
    .eq('workspace_id', ctx.workspaceId)
    .order('deleted_at', { ascending: false })
    .limit(500);
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map(({ snapshot, ...r }) => ({
    ...r,
    items: Object.values(snapshot?.children ?? {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
    purge_on: addDays(todayIso(new Date(r.deleted_at)), TRASH_DAYS),
  }));
}

/** Repõe os leads indicados (pela ordem); devolve os ids dos leads repostos. */
export async function restoreTrash(ctx: ApiContext, ids: string[]): Promise<string[]> {
  const restored: string[] = [];
  for (const id of ids) {
    const { data, error } = await ctx.supabase.rpc('restore_trashed_lead', { p_trash_id: id });
    if (error) {
      if (restored.length) break;
      throw fromPostgrest(error);
    }
    restored.push(String(data));
  }
  if (!restored.length) throw new ApiError(404, 'Nada para repor');
  return restored;
}

/** Apaga de vez (e os ficheiros). Sem ids: esvazia a reciclagem toda. */
export async function purgeTrash(ctx: ApiContext, ids?: string[]): Promise<number> {
  let q = ctx.supabase.from('lead_trash').select('id, snapshot').eq('workspace_id', ctx.workspaceId);
  if (ids?.length) q = q.in('id', ids);
  const { data, error } = await q;
  if (error) throw fromPostgrest(error);
  return purgeRows(ctx.supabase, (data ?? []) as { id: string; snapshot: unknown }[]);
}

async function purgeRows(client: SupabaseClient, rows: { id: string; snapshot: unknown }[]): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await client.from('lead_trash').delete().in('id', rows.map((r) => r.id));
  if (error) throw fromPostgrest(error);
  // Os ficheiros (kit da marca, briefing) só saem quando o lead sai de vez.
  const byBucket = new Map<string, string[]>();
  for (const r of rows) for (const f of trashFilePaths(r.snapshot)) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
  const admin = createSupabaseAdminClient();
  for (const [bucket, paths] of byBucket) {
    await admin.storage
      .from(bucket)
      .remove(paths)
      .catch((e: unknown) => console.warn('[reciclagem] ficheiros não apagados', bucket, e instanceof Error ? e.message : e));
  }
  return rows.length;
}

/** Cron diário: apaga de vez o que está na reciclagem há mais de 30 dias (todos os workspaces). */
export async function purgeExpiredTrash(options: { dryRun?: boolean; now?: Date } = {}): Promise<number> {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date((options.now ?? new Date()).getTime() - TRASH_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin.from('lead_trash').select('id, snapshot').lt('deleted_at', cutoff).limit(1000);
  if (error) throw fromPostgrest(error);
  if (options.dryRun) return data?.length ?? 0;
  return purgeRows(admin, (data ?? []) as { id: string; snapshot: unknown }[]);
}
