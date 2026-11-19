/**
 * "A trabalhar agora": como a plataforma escolhe o(s) projeto(s) em curso que
 * aparecem no topo do Dashboard, por esta ordem:
 *   1. o projeto fixado à mão ("A trabalhar nisto");
 *   2. o projeto com o temporizador a contar;
 *   3. os projetos em que se mexeu nas últimas 48 horas (o mais recente primeiro);
 *   4. os restantes, pelo prazo de entrega mais próximo.
 */
import type { Project } from './project-tools';

/** Janela de "mexeste nisto há pouco" (horas). */
export const WORKING_RECENT_HOURS = 48;

export type WorkingReason = 'fixado' | 'temporizador' | 'recente' | 'prazo';

export const WORKING_REASON_LABELS: Record<WorkingReason, string> = {
  fixado: 'Fixado por ti',
  temporizador: 'A contar',
  recente: 'Mexeste há pouco',
  prazo: 'Entrega mais próxima',
};

export interface WorkingPick {
  project: Project;
  reason: WorkingReason;
}

/** Os projetos a mostrar no topo do Dashboard, por ordem (no máximo `count`, três). */
export function workingOnPicks(
  projects: Project[],
  opts: { pinned?: string | null; runningLeadId?: string | null; now?: number; count?: number } = {},
): WorkingPick[] {
  const { pinned = null, runningLeadId = null, now = Date.now(), count = 3 } = opts;
  const picks: WorkingPick[] = [];
  const seen = new Set<string>();
  const add = (project: Project | undefined, reason: WorkingReason) => {
    if (!project || seen.has(project.lead.id)) return;
    seen.add(project.lead.id);
    picks.push({ project, reason });
  };

  add(pinned ? projects.find((p) => p.lead.id === pinned) : undefined, 'fixado');
  add(runningLeadId ? projects.find((p) => p.lead.id === runningLeadId) : undefined, 'temporizador');

  const since = now - WORKING_RECENT_HOURS * 3_600_000;
  const touchedAt = (p: Project) => (p.last_touch ? Date.parse(p.last_touch) : Number.NaN);
  const touched = projects
    .filter((p) => touchedAt(p) >= since)
    .sort((a, b) => touchedAt(b) - touchedAt(a));
  for (const p of touched) add(p, 'recente');

  const byDue = [...projects].sort((a, b) => (a.info.due_on ?? '9999-12-31').localeCompare(b.info.due_on ?? '9999-12-31'));
  for (const p of byDue) add(p, 'prazo');

  return picks.slice(0, Math.max(0, count));
}
