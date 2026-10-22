'use client';

/**
 * Projetos: os clientes com o projeto em curso (ou concluídos), em lista (por
 * prazo, com ações rápidas), por fases (colunas) ou num calendário do mês.
 */
import { DEFAULT_FEATURES, formatCurrency, todayIso, type Lead } from '@vndesign/core';
import { CalendarDays, Columns3, List } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatTile } from '@/components/charts/stat-tile';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { useBilling, useProjects, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ProjectRow } from './project-row';
import { WrapUpDialog } from './project-toggle';
import { ProjectsCalendar } from './projects-calendar';
import { StagesBoard } from './stages-board';

const euros = (v: number) => formatCurrency(v, { decimals: false });

type View = 'list' | 'stages' | 'calendar';
const VIEWS = [
  { value: 'list', label: 'Lista', icon: List },
  { value: 'stages', label: 'Fases', icon: Columns3 },
  { value: 'calendar', label: 'Calendário', icon: CalendarDays },
] as const;
const VIEW_KEY = 'vnd.projects.view';

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; icon?: typeof List }[];
}) {
  return (
    <div
      className="grid gap-1.5 sm:flex"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="group"
      aria-label={label}
    >
      {options.map(({ value: v, label: l, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text pointer-coarse:min-h-10"
        >
          {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
          {l}
        </button>
      ))}
    </div>
  );
}

export function ProjectsView() {
  const [view, setView] = useState<View>('list');
  const [state, setState] = useState<'active' | 'completed'>('active');
  // Na vista por fases e no calendário, só os projetos em curso.
  const listState = view === 'list' ? state : 'active';
  const { data: projects, isLoading } = useProjects(listState);
  const { data: settings } = useSettings();
  const features = settings?.features ?? DEFAULT_FEATURES;
  const showPayments = features.payments;
  const { data: billing } = useBilling(showPayments);
  const [today] = useState(() => todayIso());
  const [wrapUp, setWrapUp] = useState<Lead | null>(null);

  // Lembra a última vista escolhida (neste browser).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY) as View | null;
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- só depois de montar (localStorage não existe no servidor) */
      if (saved && VIEWS.some((v) => v.value === saved)) setView(saved);
    } catch {
      // sem localStorage: fica a lista
    }
  }, []);
  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignora
    }
  }

  const overdueProjects = (projects ?? []).filter((p) => listState === 'active' && p.info.due_on && p.info.due_on < today).length;

  return (
    <div className="flex flex-col gap-5">
      {showPayments && billing ? (
        <section aria-label="Faturação" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Projetos em curso"
            value={billing.active_projects}
            hint={overdueProjects ? <span className="text-danger">{overdueProjects} com a entrega atrasada</span> : undefined}
          />
          <StatTile label="Recebido este mês" value={euros(billing.received_month)} />
          <StatTile label="Por receber" value={euros(billing.outstanding)} hint={billing.outstanding === 0 ? 'Cria um plano de pagamentos em cada projeto' : undefined} />
          <StatTile
            label="Em atraso"
            value={<span className={billing.overdue ? 'text-danger' : undefined}>{euros(billing.overdue)}</span>}
            hint={billing.overdue_count ? `${billing.overdue_count} pagamento${billing.overdue_count === 1 ? '' : 's'}` : undefined}
          />
        </section>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <Segmented label="Vista" value={view} onChange={changeView} options={VIEWS} />
        {view === 'list' ? (
          <Segmented
            label="Que projetos mostrar"
            value={state}
            onChange={setState}
            options={[
              { value: 'active', label: 'Em curso' },
              { value: 'completed', label: 'Concluídos' },
            ]}
          />
        ) : null}
      </div>

      {view === 'calendar' ? (
        <ProjectsCalendar today={today} />
      ) : isLoading ? (
        <Card>
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        </Card>
      ) : !projects?.length ? (
        <Card>
          <EmptyState title={listState === 'active' ? 'Sem projetos em curso' : 'Ainda sem projetos concluídos'}>
            <p>
              {listState === 'active'
                ? 'Quando um lead passa a “Cliente”, o projeto aparece aqui até o marcares como concluído.'
                : 'Os projetos que marcares como concluídos ficam aqui.'}
            </p>
          </EmptyState>
        </Card>
      ) : view === 'stages' ? (
        <StagesBoard projects={projects} today={today} />
      ) : (
        <Card>
          <ul className={cn('divide-y divide-border')} aria-label={state === 'active' ? 'Projetos em curso' : 'Projetos concluídos'}>
            {projects.map((p) => (
              <ProjectRow key={p.lead.id} project={p} today={today} features={features} onWrapUp={setWrapUp} />
            ))}
          </ul>
        </Card>
      )}
      {wrapUp ? <WrapUpDialog lead={wrapUp} onClose={() => setWrapUp(null)} /> : null}
    </div>
  );
}
