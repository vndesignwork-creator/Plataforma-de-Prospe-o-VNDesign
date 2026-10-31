'use client';

/**
 * Lista | Kanban | Mapa: a mesma lista de leads vista de outra forma. Os filtros
 * (no endereço) passam de uma vista para a outra; a ordem e a página não.
 */
import { Columns3, Map as MapIcon, Rows3 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const VIEWS = [
  { id: 'lista', href: '/leads', label: 'Lista', icon: Rows3 },
  { id: 'kanban', href: '/kanban', label: 'Kanban', icon: Columns3 },
  { id: 'mapa', href: '/mapa', label: 'Mapa', icon: MapIcon },
] as const;

/** Filtros partilhados (os mesmos nomes no endereço da Lista e do Kanban). */
const SHARED = ['q', 'sector', 'status', 'channel', 'servico', 'etiqueta', 'resp', 'city', 'cf', 'due', 'parado', 'de', 'ate'];

export function ViewSwitch({ current }: { current: (typeof VIEWS)[number]['id'] }) {
  const params = useSearchParams();
  const shared = new URLSearchParams();
  for (const key of SHARED) {
    const v = params.get(key);
    // O Kanban mostra todos os estados em colunas: o filtro de estado não passa para lá.
    if (v && !(key === 'status' && current !== 'kanban')) shared.set(key, v);
  }
  const qs = shared.toString();
  return (
    // ml-auto: sempre encostado à direita (também quando passa para outra linha no telemóvel).
    <div role="group" aria-label="Vista" className="ml-auto inline-flex h-10 items-center rounded-lg border border-border-input bg-surface-2 p-0.5">
      {VIEWS.map(({ id, href, label, icon: Icon }) =>
        id === current ? (
          <span key={id} aria-current="page" className="inline-flex h-full items-center gap-1.5 rounded-md bg-surface px-3 text-sm font-medium shadow-sm">
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </span>
        ) : (
          <Link
            key={id}
            href={id === 'mapa' || !qs ? href : `${href}?${qs}`}
            aria-label={id === 'mapa' ? 'Ver os leads no mapa' : `Ver os leads em ${label}`}
            className={cn('inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm text-muted hover:text-fg')}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        ),
      )}
    </div>
  );
}
