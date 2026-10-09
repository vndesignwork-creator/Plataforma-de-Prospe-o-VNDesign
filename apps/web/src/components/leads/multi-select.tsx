'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: string;
  /** Ícone de linha antes do rótulo (decorativo). */
  icon?: ReactNode;
}

/** Filtro de escolha múltipla (menu com caixas de verificação). */
export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const count = value.length;
  return (
    <DropdownRoot>
      <DropdownTrigger
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors hover:border-border-strong',
          count ? 'border-accent/60 bg-accent-soft text-fg' : 'border-border-input bg-surface-2 text-fg',
        )}
        aria-label={count ? `${label}: ${count} selecionado(s)` : label}
      >
        {label}
        {count ? (
          <span className="rounded bg-accent px-1.5 text-xs font-semibold text-accent-fg tabular">{count}</span>
        ) : null}
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="start">
        {options.map((o) => (
          <DropdownCheckboxItem
            key={o.value}
            checked={value.includes(o.value)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, o.value] : value.filter((v) => v !== o.value))
            }
          >
            <span className="flex items-center gap-2">
              {o.icon}
              {o.label}
            </span>
          </DropdownCheckboxItem>
        ))}
        {count ? (
          <>
            <DropdownSeparator />
            <DropdownItem onSelect={() => onChange([])}>Limpar seleção</DropdownItem>
          </>
        ) : null}
      </DropdownContent>
    </DropdownRoot>
  );
}
