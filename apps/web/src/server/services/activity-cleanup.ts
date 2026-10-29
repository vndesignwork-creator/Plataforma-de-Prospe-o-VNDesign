/**
 * Limpeza automática dos registos antigos (Definições → Follow-up e lembretes).
 * Só os "Lead editado" com mais de N meses: os emails, respostas, mudanças de
 * estado, notas e tarefas ficam sempre (contam para as estatísticas, o limite
 * diário de emails e a sequência de follow-ups). Desligada por omissão.
 */
import { WorkspaceSettingsSchema } from '@vndesign/core';
import { fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';

/** Tipos de registo que a limpeza pode apagar. */
export const CLEANUP_TYPES = ['updated'] as const;

export async function purgeOldActivities(options: { dryRun?: boolean; now?: Date } = {}): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('workspaces').select('id, settings');
  if (error) throw fromPostgrest(error);
  let total = 0;
  for (const w of (data ?? []) as { id: string; settings: unknown }[]) {
    const months = WorkspaceSettingsSchema.safeParse(w.settings ?? {}).data?.activity_cleanup_months ?? null;
    if (!months) continue;
    const cutoff = new Date(options.now ?? new Date());
    cutoff.setMonth(cutoff.getMonth() - months);
    const base = () => admin.from('lead_activities');
    if (options.dryRun) {
      const { count, error: e } = await base()
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', w.id)
        .in('type', [...CLEANUP_TYPES])
        .lt('created_at', cutoff.toISOString());
      if (e) throw fromPostgrest(e);
      total += count ?? 0;
      continue;
    }
    const { count, error: e } = await base()
      .delete({ count: 'exact' })
      .eq('workspace_id', w.id)
      .in('type', [...CLEANUP_TYPES])
      .lt('created_at', cutoff.toISOString());
    if (e) throw fromPostgrest(e);
    total += count ?? 0;
  }
  return total;
}
