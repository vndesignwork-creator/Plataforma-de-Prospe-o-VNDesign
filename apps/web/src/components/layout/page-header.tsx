import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  actionsClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /** Classes do contentor das ações (ex.: alinhar à direita ou grelha no telemóvel). */
  actionsClassName?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold break-words sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className={cn('ml-auto flex flex-wrap items-center justify-end gap-2', actionsClassName)}>{actions}</div> : null}
    </div>
  );
}
