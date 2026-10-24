/**
 * Agenda da semana: o resumo dos compromissos e o "Distribuir pela semana"
 * (os follow-ups de um dia cheio passam para os dias úteis seguintes com lugar).
 */
import { addDays, workingDay } from './format';
import type { CalendarEvent } from './project-tools';

/** Quantos follow-ups por dia antes de a Agenda sugerir "Distribuir". */
export const AGENDA_DAY_LIMIT = 8;

/** Sábado ou domingo. */
export function isWeekend(isoDate: string): boolean {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Os follow-ups de `day` que passam do limite vão, pela ordem, para os dias
 * seguintes que ainda têm lugar (sem fins de semana, a não ser que se trabalhe
 * ao fim de semana). `counts` = follow-ups já marcados em cada dia.
 * Devolve só os que mudam de dia.
 */
export function spreadFollowUps(
  ids: readonly string[],
  day: string,
  counts: Readonly<Record<string, number>>,
  options: { limit?: number; workWeekends?: boolean } = {},
): { id: string; date: string }[] {
  const limit = options.limit ?? AGENDA_DAY_LIMIT;
  const workWeekends = options.workWeekends ?? false;
  const used: Record<string, number> = { ...counts };
  const moves: { id: string; date: string }[] = [];
  let date = day;
  for (const id of ids.slice(limit)) {
    do {
      date = workingDay(addDays(date, 1), workWeekends);
    } while ((used[date] ?? 0) >= limit);
    used[date] = (used[date] ?? 0) + 1;
    moves.push({ id, date });
    // Ainda há lugar neste dia: o próximo tenta o mesmo.
    if ((used[date] ?? 0) < limit) date = addDays(date, -1);
  }
  return moves;
}

export type AgendaSummary = { meetings: number; dues: number; receivable: number; tasks: number; followups: number };

/** O resumo da semana: reuniões, entregas, valor a receber, tarefas por fazer e follow-ups. */
export function agendaSummary(events: readonly CalendarEvent[]): AgendaSummary {
  const s: AgendaSummary = { meetings: 0, dues: 0, receivable: 0, tasks: 0, followups: 0 };
  for (const e of events) {
    if (e.type === 'meeting') s.meetings++;
    else if (e.type === 'due') s.dues++;
    else if (e.type === 'payment' && !e.done) s.receivable += e.amount ?? 0;
    else if (e.type === 'task' && !e.done) s.tasks++;
    else if (e.type === 'followup') s.followups++;
  }
  return s;
}
