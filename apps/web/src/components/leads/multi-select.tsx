'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownRadioGroup,
  DropdownRadioItem,
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

const triggerClass = (active: boolean) =>
  cn(
    'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors hover:border-border-strong',
    active ? 'border-accent/60 bg-accent-soft text-fg' : 'border-border-input bg-surface-2 text-fg',
  );

/**
 * Filtro de escolha única com o mesmo aspeto dos outros (em vez de uma lista
 * nativa do browser). A 1.ª opção é a "sem filtro"; as outras ficam realçadas.
 */
export function SingleSelectFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value) ?? options[0]!;
  const active = current.value !== options[0]?.value;
  return (
    <DropdownRoot>
      <DropdownTrigger className={triggerClass(active)} aria-label={`${label}: ${current.label}`}>
        {current.label}
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="start">
        {/* Pelo índice: o valor "sem filtro" é a string vazia. */}
        <DropdownRadioGroup value={String(options.indexOf(current))} onValueChange={(i) => onChange(options[Number(i)]!.value)}>
          {options.map((o, i) => (
            <DropdownRadioItem key={o.value} value={String(i)}>
              <span className="flex items-center gap-2">
                {o.icon}
                {o.label}
              </span>
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </DropdownRoot>
  );
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
        className={triggerClass(count > 0)}
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
