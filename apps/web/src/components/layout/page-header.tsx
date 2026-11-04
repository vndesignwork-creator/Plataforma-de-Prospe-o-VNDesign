import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  aside,
  actionsClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /** No canto direito da linha de cima, sempre no mesmo sítio (não anda com a largura do título; ex.: "29 de 34 ‹ ›"). */
  aside?: ReactNode;
  /** Classes do contentor das ações (ex.: alinhar à direita ou grelha no telemóvel). */
  actionsClassName?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      {aside ? (
        // A linha de cima ocupa a largura toda: o "aside" fica sempre encostado à direita.
        <div className="-mb-2 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted">
          <div className="min-w-0">{eyebrow}</div>
          {aside}
        </div>
      ) : null}
      <div className="min-w-0">
        {eyebrow && !aside ? <div className="mb-1 text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold break-words sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className={cn('ml-auto flex flex-wrap items-center justify-end gap-2', actionsClassName)}>{actions}</div> : null}
    </div>
  );
}
