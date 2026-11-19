/**
 * Aniversário do site: um ano depois de o projeto ficar concluído (e em cada
 * ano a seguir), cria uma tarefa e avisa quem trata do cliente. O email já vem
 * escrito na ficha ("Email de aniversário"). Corre uma vez por dia, no cron.
 */
import { WorkspaceSettingsSchema, anniversaryDue, anniversaryTaskTitle, formatDate, leadPath, todayIso } from '@vndesign/core';
import { createSupabaseAdminClient } from '../supabase-admin';
import { saveAlert } from './push';

export async function runSiteAnniversaries(options: { dryRun?: boolean; now?: Date } = {}): Promise<{ due: number; tasks: number }> {
  const admin = createSupabaseAdminClient();
  const today = todayIso(options.now ?? new Date());
  // Só projetos concluídos há mais de 11 meses (os outros ainda não fazem anos).
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCMonth(limit.getUTCMonth() - 11);
  const { data, error } = await admin
    .from('leads')
    .select('id, number, company_name, workspace_id, project_completed_at, assigned_to, created_by')
    .eq('status', 'cliente')
    .not('project_completed_at', 'is', null)
    .lte('project_completed_at', limit.toISOString())
    .is('archived_at', null)
    .is('anonymized_at', null)
    .limit(2000);
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    number: number;
    company_name: string;
    workspace_id: string;
    project_completed_at: string;
    assigned_to: string | null;
    created_by: string | null;
  };
  const rows = ((data ?? []) as Row[])
    .map((lead) => ({ lead, due: anniversaryDue(lead.project_completed_at, today) }))
    .filter((r): r is { lead: Row; due: { on: string; years: number } } => !!r.due);
  if (!rows.length) return { due: 0, tasks: 0 };

  // Só nos workspaces com a funcionalidade ligada.
  const workspaceIds = [...new Set(rows.map((r) => r.lead.workspace_id))];
  const { data: workspaces } = await admin.from('workspaces').select('id, settings').in('id', workspaceIds);
  const enabled = new Set(
    ((workspaces ?? []) as { id: string; settings: unknown }[])
      .filter((w) => {
        const features = WorkspaceSettingsSchema.parse(w.settings ?? {}).features;
        return features.projects && features.site_anniversary;
      })
      .map((w) => w.id),
  );
  const todo = rows.filter((r) => enabled.has(r.lead.workspace_id));
  if (options.dryRun) return { due: todo.length, tasks: 0 };

  let tasks = 0;
  for (const { lead, due } of todo) {
    const title = anniversaryTaskTitle(lead.company_name, due.years);
    // O título leva o número de anos: se já existe (feita ou não), este ano já foi tratado.
    const { data: already } = await admin
      .from('lead_tasks')
      .select('id')
      .eq('workspace_id', lead.workspace_id)
      .eq('lead_id', lead.id)
      .eq('title', title)
      .limit(1);
    if (already?.length) continue;
    const userId = lead.assigned_to ?? lead.created_by;
    const { error: taskError } = await admin.from('lead_tasks').insert({
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      title,
      due_on: due.on,
      assigned_to: userId,
      created_by: null,
      position: -1,
    });
    if (taskError) {
      console.warn('[aniversário] tarefa', taskError.message);
      continue;
    }
    tasks++;
    if (userId) {
      await saveAlert(lead.workspace_id, userId, {
        kind: 'client',
        leadId: lead.id,
        title: `🎂 O site da ${lead.company_name} faz ${due.years} ano${due.years === 1 ? '' : 's'}`,
        body: `A ${formatDate(due.on)}. Boa altura para propor uma revisão — o email já está escrito na ficha.`,
        url: `${leadPath(lead)}#projeto`,
        tag: `anniversary-${lead.id}-${due.on}`,
      }).catch(() => undefined);
    }
  }
  return { due: todo.length, tasks };
}
