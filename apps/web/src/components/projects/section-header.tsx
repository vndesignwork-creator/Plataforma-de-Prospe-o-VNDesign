import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Cabeçalho de uma secção do cartão "Projeto": ícone, título, resumo e ação. */
export function SectionHeader({
  id,
  icon: Icon,
  title,
  summary,
  action,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  summary?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h3 id={id} className="inline-flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted" aria-hidden />
        {title}
      </h3>
      {summary ? <span className="text-sm text-muted tabular">{summary}</span> : null}
      {action ? <span className="ml-auto flex flex-wrap items-center gap-2">{action}</span> : null}
    </div>
  );
}
