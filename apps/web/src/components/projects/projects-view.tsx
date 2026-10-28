'use client';

/**
 * Projetos: os clientes com o projeto em curso (ou concluídos), em lista (por
 * prazo, com ações rápidas), por fases (colunas) ou num calendário do mês.
 */
import {
  DEFAULT_FEATURES,
  PROJECT_FILTERS,
  PROJECT_FILTER_LABELS,
  PROJECT_SORTS,
  PROJECT_SORT_LABELS,
  PROJECTS_ORDER_PREFERENCE,
  formatCurrency,
  reorderSubset,
  projectMatches,
  sortProjects,
  todayIso,
  type Lead,
  type ProjectFilter,
  type ProjectSort,
} from '@vndesign/core';
import { CalendarDays, ChevronsDownUp, ChevronsUpDown, Columns3, List } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StatTile } from '@/components/charts/stat-tile';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { setCollapsedKeys } from '@/components/ui/collapse';
import { Select } from '@/components/ui/input';
import { useBilling, usePreference, useProjects, useSetPreference, useSettings } from '@/lib/queries';
import { ProjectRow, projectCollapseKey } from './project-row';
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
const SORT_KEY = 'vnd.projects.sort';

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
  const [filter, setFilter] = useState<ProjectFilter>('todos');
  const [sort, setSort] = useState<ProjectSort>('prazo');

  // Lembra a última vista escolhida (neste browser).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY) as View | null;
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- só depois de montar (localStorage não existe no servidor) */
      if (saved && VIEWS.some((v) => v.value === saved)) setView(saved);
      // Vindo do Dashboard ("2 com a entrega atrasada"): lista com esse filtro.
      const fromUrl = new URLSearchParams(window.location.search).get('filtro') as ProjectFilter | null;
      if (fromUrl && PROJECT_FILTERS.includes(fromUrl)) {
        setView('list');
        setFilter(fromUrl);
      }
      const savedSort = localStorage.getItem(SORT_KEY) as ProjectSort | null;
      if (savedSort && PROJECT_SORTS.includes(savedSort)) setSort(savedSort);
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

  function changeSort(v: ProjectSort) {
    setSort(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {
      // ignora
    }
  }

  // Filtros (só nos projetos em curso) e ordem, na vista em lista.
  const filtering = view === 'list' && state === 'active';
  const counts = Object.fromEntries(PROJECT_FILTERS.map((f) => [f, (projects ?? []).filter((p) => projectMatches(p, f, today)).length])) as Record<ProjectFilter, number>;
  // "A minha ordem": a que se arrastou (guardada na conta, vale nos outros dispositivos).
  const { data: savedOrder } = usePreference<string[]>(PROJECTS_ORDER_PREFERENCE);
  const manual = Array.isArray(savedOrder) ? savedOrder : [];
  const saveOrder = useSetPreference<string[]>(PROJECTS_ORDER_PREFERENCE);
  const shown = projects ? sortProjects(filtering ? projects.filter((p) => projectMatches(p, filter, today)) : projects, sort, manual) : projects;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const nameOf = (id: string | number) => {
    const p = projects?.find((x) => x.lead.id === id);
    return p ? `#${p.lead.number} ${p.lead.company_name}` : 'projeto';
  };
  const position = (id: string | number | undefined) => (shown ?? []).findIndex((p) => p.lead.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `A mover ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} na posição ${position(over.id)} de ${shown?.length ?? 0}.` : ''),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} largado na posição ${position(over.id)}.` : 'Movimento cancelado.'),
    onDragCancel: () => 'Movimento cancelado.',
  };

  /** Arrastar um projeto: passa a "A minha ordem" (a partir da ordem que se estava a ver). */
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !projects || !shown) return;
    const visible = shown.map((p) => p.lead.id);
    const from = visible.indexOf(String(active.id));
    const to = visible.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const base = sortProjects(projects, sort, manual).map((p) => p.lead.id);
    const next = reorderSubset(base, arrayMove(visible, from, to));
    saveOrder.mutateAsync(next).catch(() => toast.error('Não foi possível guardar a ordem.'));
    if (sort !== 'manual') {
      changeSort('manual');
      toast.success('Ordem guardada: “Ordenar por” passou a “A minha ordem”.');
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

      {view === 'list' && projects?.length ? (
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
          {filtering ? (
            <div className="relative flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar projetos">
              {PROJECT_FILTERS.filter((f) => f !== 'pagamentos' || showPayments).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  disabled={f !== 'todos' && counts[f] === 0}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted hover:bg-surface-2 disabled:opacity-50 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text pointer-coarse:min-h-10"
                >
                  {PROJECT_FILTER_LABELS[f]}
                  <span className="tabular text-xs">{counts[f]}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 lg:ml-auto">
            <label htmlFor="projects-sort" className="text-sm text-muted">
              Ordenar por
            </label>
            <Select id="projects-sort" value={sort} onChange={(e) => changeSort(e.target.value as ProjectSort)} className="h-9 w-auto text-sm">
              {PROJECT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_SORT_LABELS[s]}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setCollapsedKeys((shown ?? []).map((p) => projectCollapseKey(p.lead.id)), true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
              title="Recolher todos"
            >
              <ChevronsDownUp className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Recolher todos</span>
            </button>
            <button
              type="button"
              onClick={() => setCollapsedKeys((shown ?? []).map((p) => projectCollapseKey(p.lead.id)), false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
              title="Abrir todos"
            >
              <ChevronsUpDown className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Abrir todos</span>
            </button>
          </div>
        </div>
      ) : null}

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
        <>
          {!shown?.length ? (
            <Card>
              <p className="p-4 text-center text-sm text-muted">Nenhum projeto com este filtro.</p>
            </Card>
          ) : null}
          {/* Cada projeto no seu cartão, com espaço entre eles (separa bem um projeto do seguinte). */}
          {/* Pega ⠿ em cada projeto: arrastar muda a ordem (Ordenar por → A minha ordem). */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements }}>
            <SortableContext items={(shown ?? []).map((p) => p.lead.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-5" aria-label={state === 'active' ? 'Projetos em curso' : 'Projetos concluídos'}>
                {(shown ?? []).map((p) => (
                  <ProjectRow key={p.lead.id} project={p} today={today} features={features} onWrapUp={setWrapUp} sortable={(shown?.length ?? 0) > 1} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
      {wrapUp ? <WrapUpDialog lead={wrapUp} onClose={() => setWrapUp(null)} /> : null}
    </div>
  );
}
