/**
 * Mudar as datas de vários follow-ups e tarefas de uma vez: "Pôr em dia" os
 * atrasados (cartão Hoje), "Próximo follow-up" na lista de leads e o "Anular"
 * dessas ações (volta a pôr as datas de antes).
 */
import { z } from 'zod';
import { addDays } from './format';
import { weekStart } from './project-tools';
import { nullableDate } from './schemas';

export const RescheduleSchema = z
  .object({
    leads: z
      .array(z.object({ id: z.uuid(), next_action_on: nullableDate }))
      .max(200, { error: 'No máximo 200 leads de cada vez.' })
      .default([])
      .meta({ description: 'Próxima ação (follow-up) de cada lead' }),
    tasks: z
      .array(z.object({ id: z.uuid(), due_on: nullableDate }))
      .max(200, { error: 'No máximo 200 tarefas de cada vez.' })
      .default([])
      .meta({ description: 'Prazo de cada tarefa' }),
  })
  .refine((v) => v.leads.length + v.tasks.length > 0, { error: 'Nada para mudar.' })
  .meta({ id: 'Reschedule' });
export type RescheduleInput = z.input<typeof RescheduleSchema>;

export const RescheduleResultSchema = z
  .object({ leads: z.int(), tasks: z.int() })
  .meta({ id: 'RescheduleResult', description: 'Quantos leads e tarefas mudaram' });
export type RescheduleResult = z.infer<typeof RescheduleResultSchema>;

export const RESCHEDULE_TARGETS = ['today', 'tomorrow', 'next_week'] as const;
export type RescheduleTarget = (typeof RESCHEDULE_TARGETS)[number];
export const RESCHEDULE_TARGET_LABELS: Record<RescheduleTarget, string> = {
  today: 'Hoje',
  tomorrow: 'Amanhã',
  next_week: 'Próxima semana',
};

/** A data de cada escolha ("Próxima semana" = a segunda-feira seguinte, como no prazo das tarefas). */
export function rescheduleDate(target: RescheduleTarget, today: string): string {
  if (target === 'today') return today;
  if (target === 'tomorrow') return addDays(today, 1);
  return addDays(weekStart(today), 7);
}

/** O pedido para mudar tudo para `date` e o pedido que repõe as datas de antes (para o "Anular"). */
export function reschedulePlan(
  leads: readonly { id: string; next_action_on: string | null }[],
  tasks: readonly { id: string; due_on: string | null }[],
  date: string | null,
): { apply: RescheduleInput; undo: RescheduleInput } {
  return {
    apply: {
      leads: leads.map((l) => ({ id: l.id, next_action_on: date })),
      tasks: tasks.map((t) => ({ id: t.id, due_on: date })),
    },
    undo: {
      leads: leads.map((l) => ({ id: l.id, next_action_on: l.next_action_on })),
      tasks: tasks.map((t) => ({ id: t.id, due_on: t.due_on })),
    },
  };
}

/** Divide um pedido grande em pedidos de até 200 leads e 200 tarefas. */
export function chunkReschedule(input: RescheduleInput, size = 200): RescheduleInput[] {
  const leads = input.leads ?? [];
  const tasks = input.tasks ?? [];
  const out: RescheduleInput[] = [];
  for (let i = 0; i < Math.max(leads.length, tasks.length); i += size) {
    out.push({ leads: leads.slice(i, i + size), tasks: tasks.slice(i, i + size) });
  }
  return out;
}
