import type { TaskProgress as Progress } from '@vndesign/core';
import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "4/9" com uma barrinha; verde quando está tudo feito. `long` escreve "4 de 9 concluídas". */
export function TaskProgress({ progress, long, className }: { progress: Progress | null | undefined; long?: boolean; className?: string }) {
  if (!progress?.total) return null;
  const { total, done } = progress;
  const complete = done === total;
  const label = `${done} de ${total} tarefa${total === 1 ? '' : 's'} concluída${done === 1 ? '' : 's'}`;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', complete ? 'text-success' : 'text-muted', className)} title={label}>
      <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="tabular" aria-hidden={!long}>
        {long ? label : `${done}/${total}`}
      </span>
      {long ? null : <span className="sr-only">{label}</span>}
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span
          className={cn('block h-full rounded-full', complete ? 'bg-success' : 'bg-accent')}
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </span>
    </span>
  );
}
