'use client';

/**
 * Página Projetos em dois separadores:
 * - Clientes: cada cliente uma vez só (projetos, pagamentos, renovações).
 * - Projetos: os projetos em si (lista, fases, calendário), como sempre.
 * É a mesma ficha de lead nos dois: muda só o que se vê.
 */
import { BriefcaseBusiness, Users } from 'lucide-react';
import { useState } from 'react';
import { useClients, useProjects } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { rovingKeyDown, rovingTabIndex } from '@/lib/roving';
import { ClientsView } from './clients-view';
import { ProjectsView } from './projects-view';

export type ProjectsTab = 'clientes' | 'projetos';

/** A barra dos separadores (fica por baixo do título, igual nos dois). */
function Tabs({ tab, onSelect }: { tab: ProjectsTab; onSelect: (tab: ProjectsTab) => void }) {
  const { data: clients } = useClients();
  const { data: active } = useProjects('active');
  const tabs = [
    { id: 'clientes' as const, label: 'Clientes', icon: Users, count: clients?.length },
    { id: 'projetos' as const, label: 'Projetos', icon: BriefcaseBusiness, count: active?.length },
  ];
  return (
    <div className="-mt-1 border-b border-border">
      <div role="tablist" aria-label="Clientes e projetos" onKeyDown={rovingKeyDown} className="-mb-px flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            tabIndex={rovingTabIndex(tab === id, 0)}
            onClick={() => onSelect(id)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors',
              tab === id ? 'border-accent font-medium text-accent-text' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {count !== undefined ? <span className="rounded bg-surface-3 px-1.5 text-xs font-medium tabular text-muted">{count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ClientsAndProjects({ initialTab }: { initialTab: ProjectsTab }) {
  const [tab, setTab] = useState<ProjectsTab>(initialTab);

  function select(next: ProjectsTab) {
    setTab(next);
    // O separador fica no endereço (voltar atrás ou partilhar o link abre o mesmo).
    const params = new URLSearchParams(window.location.search);
    if (next === 'projetos') params.delete('ver');
    else params.set('ver', next);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `/projetos?${qs}` : '/projetos');
  }

  const tabs = <Tabs tab={tab} onSelect={select} />;
  return tab === 'clientes' ? <ClientsView tabs={tabs} /> : <ProjectsView tabs={tabs} />;
}
