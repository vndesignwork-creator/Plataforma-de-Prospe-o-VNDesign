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
  as: Heading = 'h2',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border px-4 py-3', className)}>
      <div className="min-w-0">
        <Heading className="text-base font-semibold">{title}</Heading>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'success';
}) {
  const tones = {
    neutral: 'bg-surface-3 text-fg',
    accent: 'bg-accent-soft text-accent-text',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-surface-3 text-success',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
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
