'use client';

/** Selos das tarefas: prazo e lembrete (leves, sem dependências do cartão de tarefas). */
import { formatDate, type LeadTask } from '@vndesign/core';
import { Bell } from 'lucide-react';
import { formatReminder } from '@/lib/local-datetime';
import { cn } from '@/lib/utils';

/** Prazo da tarefa: vermelho em atraso, laranja hoje. */
export function DueChip({ due, today, done }: { due: string | null; today: string; done?: boolean }) {
  if (!due) return null;
  const overdue = !done && due < today;
  const isToday = !done && due === today;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 text-xs tabular',
        overdue ? 'bg-danger-soft font-medium text-danger' : isToday ? 'bg-accent-soft font-medium text-accent-text' : 'bg-surface-3 text-muted',
      )}
    >
      {formatDate(due)}
      {overdue ? <span className="sr-only"> (em atraso)</span> : isToday ? <span className="sr-only"> (hoje)</span> : null}
    </span>
  );
}

/** 🔔 15/10 10:00 — a laranja enquanto está por avisar; cinzento depois de avisado ou com a tarefa feita. */
export function ReminderChip({ task }: { task: Pick<LeadTask, 'remind_at' | 'reminded_at' | 'done_at'> }) {
  if (!task.remind_at) return null;
  const pending = !task.reminded_at && !task.done_at && new Date(task.remind_at) > new Date();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-xs tabular',
        pending ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-muted',
      )}
      title={pending ? 'Lembrete (notificação)' : 'Lembrete já enviado'}
    >
      <Bell className="h-3 w-3" aria-hidden />
      <span className="sr-only">Lembrete: </span>
      {formatReminder(task.remind_at)}
    </span>
  );
}
