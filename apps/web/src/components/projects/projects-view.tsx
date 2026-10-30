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
  leadPath,
  reorderSubset,
  projectMatches,
  sortProjects,
  todayIso,
  type Lead,
  type ProjectFilter,
  type ProjectSort,
  type Project,
} from '@vndesign/core';
import { ArrowDownUp, CalendarDays, CheckCircle2, ChevronsDownUp, ChevronsUpDown, Columns3, List, Search } from 'lucide-react';
import Link from 'next/link';
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
import { PageHeader } from '@/components/layout/page-header';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { setCollapsedKeys, useCollapsedCount } from '@/components/ui/collapse';
import { Input, Select } from '@/components/ui/input';
import { verticalOnly } from '@/lib/dnd';
import { cn } from '@/lib/utils';
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

const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Um número da faixa do topo (com uma ação ou nota por baixo). */
function Kpi({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-[9rem] flex-1 flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-lg font-semibold tabular">{value}</span>
      {children}
    </div>
  );
}

/** Topo: quantos projetos estão em curso e quantos entregam esta semana. */
function ProjectsSummary({ projects, today }: { projects: Project[] | undefined; today: string }) {
  if (!projects) return <>Os clientes com o projeto em curso: tarefas, pagamentos e próxima reunião.</>;
  const week = projects.filter((p) => projectMatches(p, 'semana', today)).length;
  return (
    <>
      {projects.length} projeto{projects.length === 1 ? '' : 's'} em curso
      {week ? ` · ${week} entrega${week === 1 ? '' : 'm'} esta semana` : ''}
    </>
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
  const [search, setSearch] = useState('');
  // Contagens dos separadores (os concluídos só para o número).
  const { data: completedList } = useProjects('completed');
  const { data: activeList } = useProjects('active', listState !== 'active');
  const activeCount = (listState === 'active' ? projects : activeList)?.length;
  const completedCount = (listState === 'completed' ? projects : completedList)?.length;
  /** Um número que leva aos projetos: lista em curso com esse filtro. */
  function showFilter(f: ProjectFilter) {
    changeView('list');
    setState('active');
    setFilter(f);
  }

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
  const q = norm(search.trim());
  const found = (p: Project) =>
    !q || [p.lead.company_name, p.lead.project_title, p.lead.contact_name, p.lead.city].some((t) => t && norm(t).includes(q));
  const shown = projects
    ? sortProjects((filtering ? projects.filter((p) => projectMatches(p, filter, today)) : projects).filter(found), sort, manual)
    : projects;
  const collapseKeys = (shown ?? []).map((p) => projectCollapseKey(p.lead.id));
  const collapsedCount = useCollapsedCount(collapseKeys);

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
  // "Criar plano de pagamentos" leva ao primeiro projeto em curso sem plano.
  const withoutPlan = listState === 'active' ? (projects ?? []).find((p) => !p.payments.total) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Projetos" description={<ProjectsSummary projects={view === 'list' && state === 'completed' ? undefined : projects} today={today} />} />

      {/* Números do mês numa faixa baixa; os que levam a projetos filtram a lista. */}
      {showPayments && billing ? (
        <section aria-label="Faturação" className="flex flex-wrap items-stretch gap-2">
          <Kpi label="Em curso" value={String(billing.active_projects)}>
            {overdueProjects ? (
              <button type="button" onClick={() => showFilter('atrasados')} className="self-start text-left text-xs font-medium text-danger hover:underline">
                {overdueProjects} com a entrega atrasada
              </button>
            ) : null}
          </Kpi>
          <Kpi label="Recebido este mês" value={euros(billing.received_month)} />
          <Kpi label="Por receber" value={euros(billing.outstanding)}>
            {billing.outstanding === 0 && withoutPlan ? (
              <Link href={`${leadPath(withoutPlan.lead)}#projeto`} className="text-xs font-medium text-accent-text hover:underline">
                Criar plano de pagamentos
              </Link>
            ) : null}
          </Kpi>
          {billing.overdue ? (
            <Kpi label="Em atraso" value={<span className="text-danger">{euros(billing.overdue)}</span>}>
              <button type="button" onClick={() => showFilter('pagamentos')} className="self-start text-left text-xs font-medium text-danger hover:underline">
                Ver {billing.overdue_count} pagamento{billing.overdue_count === 1 ? '' : 's'}
              </button>
            </Kpi>
          ) : (
            <Kpi label="Em atraso" value={<span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />Nada em atraso</span>} />
          )}
        </section>
      ) : null}

      {/* O que mostra (Em curso | Concluídos) e como (Lista | Fases | Calendário). */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <div role="group" aria-label="Que projetos mostrar" className="-mb-px flex gap-1">
          {(
            [
              { value: 'active', label: 'Em curso', count: activeCount },
              { value: 'completed', label: 'Concluídos', count: completedCount },
            ] as const
          ).map((t) => {
            const on = (view === 'list' ? state : 'active') === t.value;
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setState(t.value);
                  if (t.value === 'completed' && view !== 'list') changeView('list');
                }}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm transition-colors',
                  on ? 'border-accent font-medium text-accent-text' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {t.label}
                {t.count !== undefined ? <span className="rounded bg-surface-3 px-1.5 text-xs font-medium tabular text-muted">{t.count}</span> : null}
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Vista" className="mb-2 inline-flex h-10 items-center rounded-lg border border-border-input bg-surface-2 p-0.5">
          {VIEWS.map(({ value: v, label: l, icon: Icon }) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => changeView(v)}
              className={cn(
                'inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm',
                view === v ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">{l}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'list' && projects?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_14rem] sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar projeto ou cliente…" aria-label="Procurar projeto ou cliente" className="h-9 pl-9" />
          </div>
          {filtering ? (
            <div className="relative flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar projetos">
              {PROJECT_FILTERS.filter((f) => f !== 'pagamentos' || showPayments).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  disabled={f !== 'todos' && counts[f] === 0}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted hover:bg-surface-2 disabled:border-dashed disabled:opacity-40 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text pointer-coarse:min-h-10"
                >
                  {PROJECT_FILTER_LABELS[f]}
                  <span className="tabular text-xs">{counts[f]}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1 sm:ml-auto">
            <ArrowDownUp className="h-4 w-4 text-muted" aria-hidden />
            <Select id="projects-sort" aria-label="Ordenar por" title="Ordenar por" value={sort} onChange={(e) => changeSort(e.target.value as ProjectSort)} className="h-9 w-auto text-sm">
              {PROJECT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_SORT_LABELS[s]}
                </option>
              ))}
            </Select>
            {/* Um só botão: abre todos se algum estiver recolhido; senão, recolhe todos. */}
            <button
              type="button"
              onClick={() => setCollapsedKeys(collapseKeys, collapsedCount === 0)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
              title={collapsedCount ? 'Abrir todos' : 'Recolher todos'}
            >
              {collapsedCount ? <ChevronsUpDown className="h-4 w-4" aria-hidden /> : <ChevronsDownUp className="h-4 w-4" aria-hidden />}
              <span className="max-sm:sr-only">{collapsedCount ? 'Abrir todos' : 'Recolher todos'}</span>
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
          <DndContext sensors={sensors} modifiers={[verticalOnly]} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements }}>
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
