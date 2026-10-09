import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BarItem {
  key: string;
  label: string;
  /** Marca de identidade ao lado do rótulo (ícone de linha ou ponto de cor). */
  mark?: ReactNode;
  value: number;
  /** Texto do valor (ex.: "1250 €"); por omissão o número. */
  display?: string;
  /** Texto secundário no fim da linha (ex.: "50% do anterior"). */
  note?: string;
}

/**
 * Barras horizontais de uma só série (cor de acento). Valores na ponta,
 * tooltip ao passar o rato e tabela equivalente para leitores de ecrã.
 */
export function BarList({
  items,
  caption,
  unit = 'leads',
  emptyText = 'Sem dados.',
}: {
  items: BarItem[];
  caption: string;
  unit?: string;
  emptyText?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!items.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <figure>
      <ul className="flex flex-col gap-2" aria-hidden>
        {items.map((item) => {
          const pct = max > 0 ? (item.value / max) * 100 : 0;
          const share = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <li key={item.key} className="group relative grid grid-cols-[minmax(0,min(11rem,42%))_minmax(0,1fr)] items-center gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-fg">
                {item.mark}
                <span className="truncate">{item.label}</span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="relative h-3.5 flex-1">
                  <span className="absolute inset-y-0 left-0 w-full rounded-r bg-surface-3 opacity-60" />
                  <span
                    className="absolute inset-y-0 left-0 rounded-r bg-accent transition-[width] duration-500"
                    style={{ width: item.value > 0 ? `max(${pct}%, 3px)` : 0 }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-medium tabular text-fg sm:w-16">{item.display ?? item.value}</span>
              </span>
              {item.note ? <span className="col-span-2 -mt-1.5 text-xs text-muted">{item.note}</span> : null}
              <span
                role="tooltip"
                className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap text-fg shadow-card group-hover:block"
              >
                {item.label}: {item.display ?? item.value}
                {unit === 'leads' && total > 0 ? ` · ${share}% do total` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      {/* Tabela equivalente para leitores de ecrã (num div: tabelas ignoram width:1px). */}
      <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key}>
              <th scope="row">{i.label}</th>
              <td>
                {i.display ?? i.value}
                {i.note ? ` (${i.note})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

/** Ponto de cor (identidade), sempre acompanhado de texto. */
export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} aria-hidden />;
}
