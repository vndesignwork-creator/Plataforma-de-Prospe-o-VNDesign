/**
 * Mudar as datas de vários follow-ups (próxima ação dos leads) e tarefas de
 * uma vez: "Pôr em dia" no cartão Hoje, "Próximo follow-up" na lista de leads
 * e o "Anular" de ambos. Um pedido por data (normalmente são todas iguais).
 */
import type { RescheduleResult, RescheduleSchema } from '@vndesign/core';
import type { z } from 'zod';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';

type Reschedule = z.output<typeof RescheduleSchema>;

function byDate<T extends { id: string }>(items: T[], date: (item: T) => string | null): Map<string | null, string[]> {
  const map = new Map<string | null, string[]>();
  for (const item of items) map.set(date(item), [...(map.get(date(item)) ?? []), item.id]);
  return map;
}

export async function reschedule(ctx: ApiContext, input: Reschedule): Promise<RescheduleResult> {
  const result: RescheduleResult = { leads: 0, tasks: 0 };
  for (const [date, ids] of byDate(input.leads, (l) => l.next_action_on)) {
    const { data, error } = await ctx.supabase
      .from('leads')
      .update({ next_action_on: date })
      .eq('workspace_id', ctx.workspaceId)
      .in('id', [...new Set(ids)])
      .is('anonymized_at', null)
      .select('id');
    if (error) throw fromPostgrest(error);
    result.leads += data?.length ?? 0;
  }
  for (const [date, ids] of byDate(input.tasks, (t) => t.due_on)) {
    const { data, error } = await ctx.supabase
      .from('lead_tasks')
      .update({ due_on: date })
      .eq('workspace_id', ctx.workspaceId)
      .in('id', [...new Set(ids)])
      .select('id');
    if (error) throw fromPostgrest(error);
    result.tasks += data?.length ?? 0;
  }
  return result;
}
