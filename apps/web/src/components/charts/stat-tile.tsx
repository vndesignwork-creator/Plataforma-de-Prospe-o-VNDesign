import type { ReactNode } from 'react';

/** Indicador: rótulo, valor e uma linha de contexto opcional. */
export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem]">{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
