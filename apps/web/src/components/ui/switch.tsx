'use client';

import { cn } from '@/lib/utils';

/** Interruptor ligado/desligado (role="switch"), no estilo da plataforma. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Nome acessível (ex.: "Ativar a pesquisa automática …"). */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors',
        'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:opacity-60',
        checked ? 'bg-accent' : 'bg-surface-3',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
