'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  /** Um único controlo (Input, Select, Textarea) — recebe id e atributos ARIA. */
  children: ReactElement<Record<string, unknown>>;
}

/** Etiqueta + controlo + mensagem de erro, com ligações ARIA corretas. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required ? (
          <span className="ml-0.5 text-accent-text" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
