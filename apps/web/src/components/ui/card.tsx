import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  actionsClassName,
  compact = false,
  as: Heading = 'h2',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Classes da zona dos botões (ex.: no telemóvel, a largura toda). */
  actionsClassName?: string;
  /**
   * Cartão ainda sem nada lá dentro: fica numa linha só (título mais apagado e o
   * botão para começar). A explicação passa para o balão do rato, para a ficha de
   * um cliente novo não ser uma parede de cartões vazios.
   */
  compact?: boolean;
  as?: 'h2' | 'h3';
}) {
  return (
    <div
      title={compact && typeof description === 'string' ? description : undefined}
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-5 py-4',
        compact && 'items-center border-b-0 py-2.5',
        className,
      )}
    >
      {/* Com pouco espaço, as ações passam para baixo do título em vez de o espremer.
          Numa linha só (compact) o título não estica, para o botão ficar ao lado. */}
      <div className={cn('min-w-0', compact ? 'flex-[0_1_auto]' : 'flex-[1_1_14rem]')}>
        <Heading className={cn('text-base font-semibold', compact && 'py-1 text-muted')}>{title}</Heading>
        {description && !compact ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {/* ml-auto: se não couberem ao lado do título, passam para baixo encostadas à direita. */}
      {actions ? <div className={cn('ml-auto flex max-w-full flex-wrap items-center justify-end gap-2', actionsClassName)}>{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  className,
  title,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  /** Explicação no balão do rato (ex.: a data por trás de "Trocar"). */
  title?: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'success';
}) {
  const tones = {
    neutral: 'bg-surface-3 text-fg',
    // Laranja mais forte: a etiqueta pode cair em cima de uma linha já alaranjada (contraste AA nos dois casos).
    accent: 'bg-accent-soft text-accent-text-strong',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-surface-3 text-success',
  };
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} aria-hidden />;
}
