/**
 * Metas do mês: as metas (definições do workspace) e o que já se fez no mês (função SQL
 * goal_progress, dias de Lisboa). "mine" conta só o que a pessoa fez (emails, chamadas,
 * WhatsApp); propostas, clientes e recebido são sempre da equipa.
 */
import { monthBounds, monthElapsed, todayIso, type GoalCounts, type GoalProgress } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { getSettings } from './workspace';

const ZERO: GoalCounts = { revenue: 0, proposals: 0, clients: 0, emails: 0, calls: 0, whatsapp: 0 };
const missingFunction = (e: { code?: string } | null) => e?.code === '42883' || e?.code === 'PGRST202';

function toCounts(raw: unknown): GoalCounts {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.keys(ZERO).map((k) => [k, Number(r[k] ?? 0) || 0])) as GoalCounts;
}

export async function getGoalProgress(ctx: ApiContext, month?: string): Promise<GoalProgress> {
  const today = todayIso();
  const m = month ?? today.slice(0, 7);
  const { from, to } = monthBounds(m);
  const [settings, team, mine] = await Promise.all([
    getSettings(ctx),
    ctx.supabase.rpc('goal_progress', { p_workspace_id: ctx.workspaceId, p_from: from, p_to: to }),
    ctx.supabase.rpc('goal_progress', { p_workspace_id: ctx.workspaceId, p_from: from, p_to: to, p_user: ctx.user.id }),
  ]);
  for (const r of [team, mine]) if (r.error && !missingFunction(r.error)) throw fromPostgrest(r.error);
  const teamCounts = team.error ? ZERO : toCounts(team.data);
  const mineCounts = mine.error ? ZERO : toCounts(mine.data);
  return {
    month: m,
    from,
    to,
    elapsed: monthElapsed(m, today),
    goals: settings.goals,
    team: teamCounts,
    // O que não é de uma pessoa (propostas, clientes, recebido) é o da equipa.
    mine: { ...teamCounts, emails: mineCounts.emails, calls: mineCounts.calls, whatsapp: mineCounts.whatsapp },
  };
}
