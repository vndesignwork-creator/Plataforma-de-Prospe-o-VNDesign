/**
 * Avisos periódicos, a partir do cron diário (cada um só uma vez no período):
 * - segunda-feira: "leads a arrefecer" (em conversa e sem mudar de fase há mais
 *   de 14 dias) no sino do dono e dos administradores;
 * - dia 1 do mês: uma tarefa "Enviar o ponto de situação do mês" em cada projeto
 *   em curso (para o responsável do lead) e um aviso a dizer quais.
 */
import {
  COOLING_DAYS,
  COOLING_STATUSES,
  MONTHLY_UPDATE_TASK,
  coolingAlert,
  lisbonDayOfMonth,
  lisbonWeekday,
  monthlyUpdateAlert,
  todayIso,
} from '@vndesign/core';
import { createSupabaseAdminClient } from '../supabase-admin';
import { saveAlert } from './push';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function managers(admin: Admin): Promise<Map<string, string[]>> {
  const { data, error } = await admin.from('workspace_members').select('workspace_id, user_id, role').in('role', ['owner', 'admin']);
  if (error) throw new Error(error.message);
  const byWorkspace = new Map<string, string[]>();
  for (const m of (data ?? []) as { workspace_id: string; user_id: string }[]) byWorkspace.set(m.workspace_id, [...(byWorkspace.get(m.workspace_id) ?? []), m.user_id]);
  return byWorkspace;
}

/** Já recebeu um aviso com este título desde `since`? */
async function alreadyAlerted(admin: Admin, workspaceId: string, userId: string, kind: string, titlePrefix: string, since: string) {
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('kind', kind)
    .like('title', `${titlePrefix}%`)
    .gte('created_at', since);
  return (count ?? 0) > 0;
}

export async function saveCoolingAlerts(options: { dryRun?: boolean; now?: Date; force?: boolean } = {}): Promise<{ workspaces: number; saved: number; skipped?: string }> {
  const now = options.now ?? new Date();
  if (!options.force && lisbonWeekday(now) !== 1) return { workspaces: 0, saved: 0, skipped: 'não é segunda-feira' };
  const admin = createSupabaseAdminClient();
  const byWorkspace = await managers(admin);
  const before = new Date(now.getTime() - COOLING_DAYS * 86_400_000).toISOString();
  const since = new Date(now.getTime() - 6 * 86_400_000).toISOString();
  let saved = 0;
  for (const [workspaceId, users] of byWorkspace) {
    const { data, count, error } = await admin
      .from('leads')
      .select('company_name', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .in('status', COOLING_STATUSES as string[])
      .lt('status_changed_at', before)
      .is('archived_at', null)
      .is('anonymized_at', null)
      .order('status_changed_at')
      .limit(3);
    if (error) {
      console.warn('[avisos] leads a arrefecer', error.message);
      continue;
    }
    if (!count) continue;
    const alert = coolingAlert(count, (data ?? []).map((l) => l.company_name as string));
    if (options.dryRun) continue;
    for (const userId of users) {
      if (await alreadyAlerted(admin, workspaceId, userId, 'daily', '🧊', since)) continue;
      if (await saveAlert(workspaceId, userId, { kind: 'daily', ...alert, tag: 'cooling' })) saved++;
    }
  }
  return { workspaces: byWorkspace.size, saved };
}

export async function runMonthlyUpdateReminders(
  options: { dryRun?: boolean; now?: Date; force?: boolean } = {},
): Promise<{ workspaces: number; tasks: number; saved: number; skipped?: string }> {
  const now = options.now ?? new Date();
  if (!options.force && lisbonDayOfMonth(now) !== 1) return { workspaces: 0, tasks: 0, saved: 0, skipped: 'não é dia 1' };
  const admin = createSupabaseAdminClient();
  const byWorkspace = await managers(admin);
  const today = todayIso(now);
  const monthStart = `${today.slice(0, 7)}-01T00:00:00Z`;
  let tasks = 0;
  let saved = 0;
  for (const [workspaceId, users] of byWorkspace) {
    const { data: projects, error } = await admin
      .from('leads')
      .select('id, company_name, assigned_to')
      .eq('workspace_id', workspaceId)
      .eq('status', 'cliente')
      .is('project_completed_at', null)
      .is('archived_at', null)
      .is('anonymized_at', null)
      .order('company_name')
      .limit(200);
    if (error) {
      console.warn('[avisos] ponto de situação', error.message);
      continue;
    }
    if (!projects?.length) continue;
    // Não repete a tarefa no mesmo mês (o cron pode correr mais de uma vez).
    const { data: existing } = await admin
      .from('lead_tasks')
      .select('lead_id')
      .eq('workspace_id', workspaceId)
      .eq('title', MONTHLY_UPDATE_TASK)
      .gte('created_at', monthStart);
    // Nem se a do mês anterior ainda está por fazer (não ficam duas iguais em aberto).
    const { data: open } = await admin
      .from('lead_tasks')
      .select('lead_id')
      .eq('workspace_id', workspaceId)
      .eq('title', MONTHLY_UPDATE_TASK)
      .is('done_at', null);
    const done = new Set([...(existing ?? []), ...(open ?? [])].map((t) => t.lead_id as string));
    const todo = projects.filter((p) => !done.has(p.id as string));
    if (options.dryRun) {
      tasks += todo.length;
      continue;
    }
    if (todo.length) {
      const { error: insertError } = await admin.from('lead_tasks').insert(
        todo.map((p) => ({
          workspace_id: workspaceId,
          lead_id: p.id,
          title: MONTHLY_UPDATE_TASK,
          due_on: today,
          assigned_to: p.assigned_to ?? null,
          created_by: null,
          position: -1,
        })),
      );
      if (insertError) {
        console.warn('[avisos] tarefas do ponto de situação', insertError.message);
        continue;
      }
      tasks += todo.length;
    }
    const alert = monthlyUpdateAlert(projects.length, projects.map((p) => p.company_name as string), now);
    for (const userId of users) {
      if (await alreadyAlerted(admin, workspaceId, userId, 'client', '📨', monthStart)) continue;
      if (await saveAlert(workspaceId, userId, { kind: 'client', ...alert, tag: 'monthly-update' })) saved++;
    }
  }
  return { workspaces: byWorkspace.size, tasks, saved };
}
