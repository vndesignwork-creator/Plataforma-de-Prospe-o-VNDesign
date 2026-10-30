'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import {
  LEAD_CHANNEL_META,
  LEAD_CHANNELS,
  LEAD_STATUS_META,
  formatCurrency,
  formatDate,
  todayIso,
  type BoardColumn,
  type Lead,
  type LeadStatus,
  type LostReason,
  leadPath,
} from '@vndesign/core';
import { ArrowLeftRight, Eye, EyeOff, GripVertical, HelpCircle, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { MultiSelectFilter, SingleSelectFilter } from '@/components/leads/multi-select';
import { ViewSwitch } from '@/components/leads/view-switch';
import { PageHeader } from '@/components/layout/page-header';
import { Button, HoverHint, buttonClasses } from '@/components/ui/button';
import { TagChips, useTagFilterOptions } from '@/components/leads/tags';
import { LostReasonDialog } from '@/components/leads/lost-reason';
import { StageAge } from '@/components/leads/stage-age';
import { Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { usePreference, useBoard, useInvalidateLead, useRole, useSectors, useSetPreference, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ChannelIcon, SectorIconView } from '@/components/icons/lead-icons';
import { ServiceIcons, useServiceFilterOptions } from '@/components/services/services';
import { TaskProgress } from '@/components/tasks/task-progress';

type Columns = Record<LeadStatus, Lead[]>;

function toColumns(board: BoardColumn[]): Columns {
  return Object.fromEntries(board.map((c) => [c.status, c.leads])) as Columns;
}

function findColumn(columns: Columns, id: string): LeadStatus | null {
  if (id in columns) return id as LeadStatus;
  for (const [status, leads] of Object.entries(columns)) {
    if (leads.some((l) => l.id === id)) return status as LeadStatus;
  }
  return null;
}

/** Posição entre os vizinhos (valores menores ficam mais acima). */
function positionAt(list: Lead[], index: number): number {
  const prev = list[index - 1]?.kanban_position;
  const next = list[index + 1]?.kanban_position;
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

function LeadCard({
  lead,
  today,
  dragging,
  handle,
  menu,
}: {
  lead: Lead;
  today: string;
  dragging?: boolean;
  /** Pega para arrastar (botão focável); no cartão fantasma é só o ícone. */
  handle?: ReactNode;
  /** Menu "Mudar estado" (alternativa a arrastar, sobretudo no telemóvel). */
  menu?: ReactNode;
}) {
  const overdue = lead.next_action_on !== null && lead.next_action_on < today;
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-3 text-sm shadow-sm',
        dragging && 'rotate-1 border-accent shadow-card',
      )}
    >
      <div className="flex items-start gap-2">
        {handle ?? <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />}
        <div className="min-w-0 flex-1">
          <Link
            href={leadPath(lead)}
            className="block font-semibold leading-snug hover:text-accent-text hover:underline"
            draggable={false}
          >
            <span className="text-muted tabular">#{lead.number}</span> {lead.company_name} {lead.project_title ? <span className="font-normal text-muted">· {lead.project_title}</span> : null}
          </Link>
          <TagChips tags={lead.tags} link={false} className="mt-1" />
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
            {lead.sector ? (
              <span className="inline-flex items-center gap-1">
                <SectorIconView sector={lead.sector} className="h-3.5 w-3.5" />
                {lead.sector.name}
              </span>
            ) : null}
            {lead.city ? <span>{lead.city}</span> : null}
            {/* Há quanto tempo está nesta coluna (a laranja se parado). */}
            {lead.status !== 'cliente' && lead.status !== 'sem_interesse' ? <StageAge since={lead.status_changed_at} compact /> : null}
          </p>
          <ServiceIcons services={lead.services} className="mt-1.5" labeled />
          <TaskProgress progress={lead.task_progress} className="mt-1.5" />
          {lead.next_action_on || lead.next_action_text ? (
            <p className={cn('mt-1.5 text-xs', overdue ? 'font-medium text-danger' : 'text-fg')}>
              {lead.next_action_text ?? 'Próxima ação'}
              {lead.next_action_on ? ` · ${formatDate(lead.next_action_on)}` : ''}
              {overdue ? ' (em atraso)' : ''}
            </p>
          ) : null}
          {lead.estimated_value != null ? (
            <p className="mt-1.5 text-xs font-medium tabular">{formatCurrency(lead.estimated_value)}</p>
          ) : null}
        </div>
        {menu}
      </div>
    </div>
  );
}

type MoveTo = (lead: Lead, to: LeadStatus) => void;

/** Botão ⇄ com a lista de estados: muda o lead de coluna com um toque, sem arrastar. */
function MoveMenu({ lead, statuses, onMove }: { lead: Lead; statuses: LeadStatus[]; onMove: MoveTo }) {
  return (
    <DropdownRoot>
      <DropdownTrigger
        aria-label={`Mudar estado de #${lead.number} ${lead.company_name}`}
        // Não deixa o toque/clique no botão começar a arrastar o cartão.
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="-m-1 shrink-0 rounded p-1 text-muted hover:bg-surface-3 hover:text-fg data-[state=open]:bg-surface-3 data-[state=open]:text-fg pointer-coarse:-m-2 pointer-coarse:p-2"
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden />
      </DropdownTrigger>
      <DropdownContent className="min-w-48">
        <DropdownLabel>Mudar para</DropdownLabel>
        {statuses
          .filter((s) => s !== lead.status)
          .map((s) => (
            <DropdownItem key={s} onSelect={() => onMove(lead, s)}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LEAD_STATUS_META[s].color }} aria-hidden />
              {LEAD_STATUS_META[s].label}
            </DropdownItem>
          ))}
      </DropdownContent>
    </DropdownRoot>
  );
}

function SortableCard({ lead, today, statuses, onMove }: { lead: Lead; today: string; statuses: LeadStatus[]; onMove: MoveTo }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  });
  // Rato: arrasta-se o cartão inteiro. Dedo: mantém-se premido (para deslizar o
  // ecrã continuar a fazer scroll). Teclado: a partir da pega.
  // O <li> continua a ser um item de lista (a pega, o link e o menu são os controlos).
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'touch-manipulation pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]',
        isDragging && 'opacity-40',
      )}
      {...listeners}
    >
      <LeadCard
        lead={lead}
        today={today}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            aria-roledescription="cartão arrastável"
            aria-label={`Mover #${lead.number} ${lead.company_name}, ${LEAD_STATUS_META[lead.status].label}`}
            className="-m-1 shrink-0 cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-3 hover:text-fg"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        }
        menu={<MoveMenu lead={lead} statuses={statuses} onMove={onMove} />}
      />
    </li>
  );
}

function Column({
  status,
  leads,
  today,
  statuses,
  onMove,
}: {
  status: LeadStatus;
  leads: Lead[];
  today: string;
  statuses: LeadStatus[];
  onMove: MoveTo;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = LEAD_STATUS_META[status];
  const value = leads.reduce((s, l) => s + (l.estimated_value ?? 0), 0);
  return (
    <section
      aria-labelledby={`col-${status}`}
      data-column={status}
      className={cn(
        // Telemóvel: colunas quase da largura do ecrã (vê-se a ponta da seguinte), com encaixe ao deslizar.
        'flex w-[min(18rem,calc(100vw-3.5rem))] shrink-0 snap-start snap-always flex-col rounded-xl border border-border bg-surface-2/60 sm:w-64 md:min-h-0 xl:w-72',
        isOver && 'border-accent',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 id={`col-${status}`} className="flex items-center gap-2 font-sans text-sm font-semibold">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
          {meta.label}
          <span className="rounded bg-surface-3 px-1.5 text-xs font-medium tabular text-muted">{leads.length}</span>
        </h2>
        {value > 0 ? <span className="text-xs text-muted tabular">{formatCurrency(value, { decimals: false })}</span> : null}
      </header>
      <SortableContext id={status} items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        {/* No telemóvel a coluna cresce e faz-se scroll à página (um só scroll vertical); a partir de md cada coluna tem o seu.
            "relative": os textos só para leitores de ecrã (posição absoluta) ficam dentro da coluna em vez de esticarem o quadro. */}
        <ul
          ref={setNodeRef}
          className="relative flex min-h-24 flex-1 flex-col gap-2 p-2 scroll-thin md:overflow-y-auto md:overscroll-contain"
          aria-label={`Leads em ${meta.label}`}
        >
          {leads.map((lead) => (
            <SortableCard key={lead.id} lead={lead} today={today} statuses={statuses} onMove={onMove} />
          ))}
          {leads.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
              Arrasta um lead para aqui
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </section>
  );
}

/** Índice das colunas (fica preso no topo): saltar para uma coluna sem deslizar o quadro todo. */
function ColumnNav({
  columns,
  active,
  onSelect,
  hidden,
  onToggle,
}: {
  columns: Columns;
  active: LeadStatus | null;
  onSelect: (status: LeadStatus) => void;
  /** Computador: as colunas escondidas (o índice serve para mostrar/esconder). */
  hidden: LeadStatus[] | null;
  onToggle: (status: LeadStatus) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const statuses = Object.keys(columns) as LeadStatus[];
  const current = active ?? statuses[0];

  // Mantém o botão da coluna atual à vista dentro do índice.
  useEffect(() => {
    const list = listRef.current;
    const button = list?.querySelector<HTMLElement>(`[data-nav="${current}"]`);
    if (!list || !button) return;
    const left = button.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + button.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - 16 });
    }
  }, [current]);

  return (
    <nav
      aria-label="Colunas do Kanban"
      className="sticky top-14 z-30 -mx-4 mt-2 mb-1 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8"
    >
      <ul ref={listRef} className="relative flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {statuses.map((status) => {
          const meta = LEAD_STATUS_META[status];
          if (hidden) {
            const shown = !hidden.includes(status);
            return (
              <li key={status} className="shrink-0">
                <button
                  type="button"
                  data-nav={status}
                  onClick={() => onToggle(status)}
                  aria-pressed={shown}
                  title={shown ? `Esconder a coluna ${meta.label}` : `Mostrar a coluna ${meta.label}`}
                  className={cn(
                    'flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                    shown ? 'border-border bg-surface text-fg hover:border-muted' : 'border-dashed border-border text-muted hover:text-fg',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                  {meta.label}
                  <span className="tabular">{columns[status].length}</span>
                  {shown ? <Eye className="h-3 w-3 text-muted" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
                </button>
              </li>
            );
          }
          const isCurrent = status === current;
          return (
            <li key={status} className="shrink-0">
              <button
                type="button"
                data-nav={status}
                onClick={() => onSelect(status)}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(
                  'flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors pointer-coarse:min-h-10',
                  isCurrent ? 'border-accent bg-accent-soft text-accent-text' : 'border-border bg-surface text-muted hover:text-fg',
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                {meta.label}
                <span className="tabular">{columns[status].length}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function KanbanBoard() {
  const today = todayIso();
  const serviceOptions = useServiceFilterOptions();
  const qc = useQueryClient();
  const router = useRouter();
  const invalidate = useInvalidateLead();
  // Filtros no endereço (?sector=…&servico=…): os mesmos nomes da Lista, passam de uma vista para a outra.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const getList = (k: string) => (searchParams.get(k) ?? '').split(',').filter(Boolean);
  function setParams(patch: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      const v = Array.isArray(value) ? value.join(',') : value;
      if (v) next.set(key, v);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  const sector = getList('sector');
  const channel = getList('channel');
  const service = getList('servico');
  const tag = getList('etiqueta');
  const assigned = searchParams.get('resp') ?? '';
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const q = useDebouncedValue(search.trim());
  useEffect(() => {
    if (q !== (searchParams.get('q') ?? '')) setParams({ q: q || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const tagOptions = useTagFilterOptions();
  const query = { q: q || undefined, sector, channel, service, tag, assigned: assigned || undefined };
  const prospector = useRole() === 'prospector';
  const { data: team } = useTeamNames();
  const assignedOptions = [
    { value: '', label: 'Todos os responsáveis' },
    { value: 'me', label: 'Os meus' },
    { value: 'none', label: 'Sem responsável' },
    ...(prospector ? [] : (team ?? []).filter((m) => m.role !== 'owner').map((m) => ({ value: m.user_id, label: m.name }))),
  ];

  // Computador: o índice das colunas serve para mostrar/esconder colunas (fica guardado na conta).
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const { data: hiddenPref } = usePreference<LeadStatus[]>('kanban.hidden');
  const saveHidden = useSetPreference<LeadStatus[]>('kanban.hidden');
  const hiddenColumns = hiddenPref ?? [];
  function toggleColumn(status: LeadStatus) {
    const next = hiddenColumns.includes(status) ? hiddenColumns.filter((s) => s !== status) : [...hiddenColumns, status];
    // Pelo menos uma coluna fica à vista.
    if (next.length >= Object.keys(LEAD_STATUS_META).length) return;
    saveHidden.mutate(next);
  }

  const { data: board, isLoading } = useBoard(query);
  const { data: sectors } = useSectors();

  // Estado local durante o arrastar (otimista); fora disso segue os dados do servidor.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const serverColumns = useMemo(() => (board ? toColumns(board) : null), [board]);
  const columns = dragColumns ?? serverColumns;

  // Rato e dedo têm sensores separados: com um só sensor de "ponteiro", deslizar o
  // dedo para fazer scroll agarrava logo o cartão. No telemóvel é preciso manter o
  // dedo parado ~¼ s; se mexer antes disso, é scroll normal.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const leadName = (id: string | number) => {
    const all = columns ? Object.values(columns).flat() : [];
    const l = all.find((x) => x.id === id);
    return l ? `#${l.number} ${l.company_name}` : 'lead';
  };
  const columnName = (id: string | number | undefined) => {
    if (!columns || id === undefined) return '';
    const s = findColumn(columns, String(id));
    return s ? LEAD_STATUS_META[s].label : '';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `A mover ${leadName(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${leadName(active.id)} sobre a coluna ${columnName(over.id)}.` : `${leadName(active.id)} fora das colunas.`),
    onDragEnd: ({ active, over }) => (over ? `${leadName(active.id)} largado em ${columnName(over.id)}.` : 'Movimento cancelado.'),
    onDragCancel: ({ active }) => `Movimento de ${leadName(active.id)} cancelado.`,
  };

  function onDragStart({ active, activatorEvent }: DragStartEvent) {
    if (!serverColumns) return;
    setActiveId(String(active.id));
    setDragColumns(structuredClone(serverColumns));
    // Vibração curta a confirmar que o cartão foi agarrado (Android).
    if ('touches' in activatorEvent) navigator.vibrate?.(10);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragColumns) return;
    const from = findColumn(dragColumns, String(active.id));
    const to = findColumn(dragColumns, String(over.id));
    if (!from || !to || from === to) return;
    setDragColumns((cols) => {
      if (!cols) return cols;
      const lead = cols[from].find((l) => l.id === active.id)!;
      const overIndex = cols[to].findIndex((l) => l.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : cols[to].length;
      const target = [...cols[to]];
      target.splice(insertAt, 0, { ...lead, status: to });
      return { ...cols, [from]: cols[from].filter((l) => l.id !== active.id), [to]: target };
    });
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const cols = dragColumns;
    if (!over || !cols || !serverColumns) {
      setDragColumns(null);
      return;
    }
    const to = findColumn(cols, String(active.id))!;
    const list = [...cols[to]];
    const oldIndex = list.findIndex((l) => l.id === active.id);
    const overIndex = list.findIndex((l) => l.id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) {
      const [moved] = list.splice(oldIndex, 1);
      list.splice(overIndex, 0, moved!);
    }
    const index = list.findIndex((l) => l.id === active.id);
    const original = Object.values(serverColumns).flat().find((l) => l.id === active.id)!;
    if (original.status === to && serverColumns[to].findIndex((l) => l.id === active.id) === index) {
      setDragColumns(null);
      return;
    }
    const position = positionAt(list, index);
    list[index] = { ...list[index]!, kanban_position: position, status: to };
    setDragColumns(null);
    await saveMove(original, to, position, { ...cols, [to]: list });
  }

  /** Menu "Mudar para": o lead vai para o topo da coluna escolhida. */
  async function moveTo(lead: Lead, to: LeadStatus) {
    if (!serverColumns || lead.status === to) return;
    const first = serverColumns[to][0];
    const position = first ? first.kanban_position - 1 : 0;
    await saveMove(lead, to, position, {
      ...serverColumns,
      [lead.status]: serverColumns[lead.status].filter((l) => l.id !== lead.id),
      [to]: [{ ...lead, status: to, kanban_position: position }, ...serverColumns[to]],
    });
  }

  const [askLost, setAskLost] = useState<Lead | null>(null);
  async function saveLostReason(lead: Lead, reason: LostReason | null, retryOn: string | null) {
    setAskLost(null);
    if (!reason) return;
    try {
      await api(`/leads/${lead.id}`, { method: 'PATCH', body: { lost_reason: reason, ...(retryOn ? { retry_on: retryOn } : {}) } });
      invalidate(lead.id);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function saveMove(original: Lead, to: LeadStatus, position: number, optimistic: Columns) {
    qc.setQueryData(['board', query], (old: BoardColumn[] | undefined) =>
      old?.map((c) => ({ ...c, leads: optimistic[c.status], total: optimistic[c.status].length })),
    );
    try {
      const { data: updated } = await api<{ data: Lead }>(`/leads/${original.id}/move`, {
        method: 'POST',
        body: { status: to, position },
      });
      if (original.status !== to) {
        // "Sem interesse": pergunta o motivo (pode ficar sem motivo).
        if (to === 'sem_interesse') setAskLost(updated);
        const scheduled = to === 'contactado' && updated.next_action_on && updated.next_action_on !== original.next_action_on;
        toast.success(
          `#${updated.number} → ${LEAD_STATUS_META[to].label}${scheduled ? `. Follow-up agendado para ${formatDate(updated.next_action_on)}.` : '.'}`,
          to === 'cliente'
            ? { description: 'Novo cliente! 🎉', action: { label: 'Criar tarefas', onClick: () => router.push(`${leadPath(original)}#tarefas`) } }
            : undefined,
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      invalidate(original.id);
    }
  }

  const activeLead = activeId && columns ? Object.values(columns).flat().find((l) => l.id === activeId) : null;
  const statuses = useMemo(() => (columns ? (Object.keys(columns) as LeadStatus[]) : []), [columns]);

  // Coluna destacada no índice: mantém-se enquanto se vir inteira (útil no computador,
  // onde se veem várias); senão passa a ser a primeira que se vê inteira.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<LeadStatus | null>(null);
  const frame = useRef(0);
  const pinnedUntil = useRef(0);
  const onBoardScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    // Durante o scroll suave depois de tocar no índice, fica a coluna escolhida.
    if (Date.now() < pinnedUntil.current) return;
    frame.current = requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      const view = { left: box.left + pad, right: box.right - pad };
      const cols = [...el.querySelectorAll<HTMLElement>('[data-column]')];
      const inView = (c: HTMLElement) => {
        const r = c.getBoundingClientRect();
        return r.left >= view.left - 2 && r.right <= view.right + 2;
      };
      setVisible((current) => {
        const kept = cols.find((c) => c.dataset.column === current);
        if (kept && inView(kept)) return current;
        const next = cols.find(inView) ?? cols.find((c) => c.getBoundingClientRect().right > view.left + 24);
        return (next?.dataset.column as LeadStatus | undefined) ?? null;
      });
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function scrollToColumn(status: LeadStatus) {
    const el = scrollerRef.current;
    const col = el?.querySelector<HTMLElement>(`[data-column="${status}"]`);
    if (!el || !col) return;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pinnedUntil.current = Date.now() + 1000;
    el.scrollTo({ left: col.offsetLeft - pad, behavior: smooth ? 'smooth' : 'auto' });
    // Se a página já desceu dentro de uma coluna comprida, volta ao topo do quadro.
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    setVisible(status);
  }

  // Uma etiqueta por filtro ativo, para tirar só esse.
  const without = (list: string[], v: string) => list.filter((x) => x !== v);
  const chips: { key: string; name: string; value: string; remove: () => void }[] = [
    ...(query.q
      ? [
          {
            key: 'q',
            name: 'Pesquisa',
            value: query.q,
            remove: () => {
              setSearch('');
              setParams({ q: null });
            },
          },
        ]
      : []),
    ...sector.map((v) => ({
      key: `sector-${v}`,
      name: 'Setor',
      value: v === 'none' ? 'Sem setor' : (sectors?.find((x) => x.id === v)?.name ?? v),
      remove: () => setParams({ sector: without(sector, v) }),
    })),
    ...service.map((v) => ({
      key: `svc-${v}`,
      name: 'Serviço',
      value: serviceOptions.find((o) => o.value === v)?.label ?? v,
      remove: () => setParams({ servico: without(service, v) }),
    })),
    ...channel.map((v) => ({
      key: `ch-${v}`,
      name: 'Canal',
      value: v === 'none' ? 'Sem canal' : (LEAD_CHANNEL_META[v as keyof typeof LEAD_CHANNEL_META]?.label ?? v),
      remove: () => setParams({ channel: without(channel, v) }),
    })),
    ...tag.map((v) => ({ key: `tag-${v}`, name: 'Etiqueta', value: v, remove: () => setParams({ etiqueta: without(tag, v) }) })),
    ...(assigned
      ? [{ key: 'resp', name: 'Responsável', value: assignedOptions.find((o) => o.value === assigned)?.label ?? assigned, remove: () => setParams({ resp: null }) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:[&>*]:shrink-0">
      <PageHeader
        title="Kanban"
        description={board ? <BoardSummary board={board} showValue={!prospector} /> : 'Os teus leads por estado.'}
        actionsClassName="ml-auto"
        actions={
          <>
            <KanbanHelp />
            <Link href="/leads/novo" className={buttonClasses('primary')}>
              <Plus className="h-4 w-4" aria-hidden />
              Novo lead
            </Link>
          </>
        }
      />
      <FirstVisitHelp />

      {/* Pesquisa · Lista | Kanban | Mapa; por baixo, os filtros numa linha (na largura do texto). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar empresa, cidade, notas…"
            aria-label="Filtrar leads no Kanban"
            className="pl-9"
          />
        </div>
        <ViewSwitch current="kanban" />
      </div>
      <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2">
        <MultiSelectFilter
          label="Setor"
          value={sector}
          onChange={(v) => setParams({ sector: v })}
          options={[...(sectors ?? []).map((s) => ({ value: s.id, label: s.name, icon: <SectorIconView sector={s} className="text-muted" /> })), { value: 'none', label: 'Sem setor' }]}
        />
        <MultiSelectFilter label="Serviço" value={service} onChange={(v) => setParams({ servico: v })} options={serviceOptions} />
        <MultiSelectFilter
          label="Canal"
          value={channel}
          onChange={(v) => setParams({ channel: v })}
          options={[...LEAD_CHANNELS.map((c) => ({ value: c, label: LEAD_CHANNEL_META[c].label, icon: <ChannelIcon channel={c} className="text-muted" /> })), { value: 'none', label: 'Sem canal' }]}
        />
        {tagOptions.length || tag.length ? <MultiSelectFilter label="Etiqueta" value={tag} onChange={(v) => setParams({ etiqueta: v })} options={tagOptions} /> : null}
        {(team?.length ?? 0) > 1 ? (
          <SingleSelectFilter label="Responsável" value={assigned} onChange={(v) => setParams({ resp: v || null })} options={assignedOptions} />
        ) : null}
      </div>
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/40 bg-accent-soft py-0.5 pr-1 pl-2.5 text-xs">
              <span className="truncate">
                <span className="text-muted">{c.name}:</span> {c.value}
              </span>
              <button
                type="button"
                onClick={c.remove}
                aria-label={`Tirar o filtro ${c.name}: ${c.value}`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-fg"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              router.replace(pathname, { scroll: false });
            }}
          >
            Limpar filtros
          </Button>
        </div>
      ) : null}

      {isLoading || !columns ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setDragColumns(null);
          }}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'Para mover um lead, carrega em Espaço ou Enter. Usa as setas para o deslocar e Espaço ou Enter para o largar. Esc cancela.',
            },
          }}
        >
          <ColumnNav columns={columns} active={visible} onSelect={scrollToColumn} hidden={desktop ? hiddenColumns : null} onToggle={toggleColumn} />
          {/* Computador (lg): o quadro ocupa a altura que sobra do ecrã (tablet: altura fixa), alinhado com o resto da página (como a tabela de Leads); cada coluna tem o seu scroll e a barra horizontal fica à vista.
              Telemóvel: as colunas crescem (scroll vertical da página) e deslizam para o lado com encaixe. */}
          <div
            ref={scrollerRef}
            onScroll={onBoardScroll}
            className={cn(
              'relative -mx-4 flex scroll-mt-28 items-start gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 scroll-px-4 scroll-thin sm:-mx-6 sm:scroll-px-6 sm:px-6 md:h-[calc(100dvh-18.5rem)] md:min-h-96 md:items-stretch lg:mx-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:!shrink lg:scroll-mt-16 lg:scroll-px-0 lg:px-0',
              activeId ? 'snap-none' : 'snap-x snap-mandatory md:snap-none',
            )}
          >
            {statuses.filter((st) => !desktop || !hiddenColumns.includes(st)).map((status) => (
              <Column key={status} status={status} leads={columns[status]} today={today} statuses={statuses} onMove={moveTo} />
            ))}
          </div>
          <DragOverlay>{activeLead ? <LeadCard lead={activeLead} today={today} dragging /> : null}</DragOverlay>
        </DndContext>
      )}
      {askLost ? (
        <LostReasonDialog
          open
          subject={`#${askLost.number} ${askLost.company_name}`}
          onPick={(reason, retryOn) => void saveLostReason(askLost, reason, retryOn)}
          onCancel={() => setAskLost(null)}
        />
      ) : null}
    </div>
  );
}

/** Topo: leads em aberto, clientes e (para quem vê valores) o valor das propostas enviadas. */
function BoardSummary({ board, showValue }: { board: BoardColumn[]; showValue: boolean }) {
  const total = (status: LeadStatus) => board.find((c) => c.status === status)?.total ?? 0;
  const open = (['identificado', 'contactado', 'respondeu', 'reuniao', 'proposta_enviada'] as LeadStatus[]).reduce((n, st) => n + total(st), 0);
  const proposals = board.find((c) => c.status === 'proposta_enviada')?.value ?? 0;
  const clients = total('cliente');
  return (
    <>
      {open} lead{open === 1 ? '' : 's'} em aberto · {clients} cliente{clients === 1 ? '' : 's'}
      {showValue && proposals > 0 ? ` · ${formatCurrency(proposals)} em propostas` : ''}
    </>
  );
}

const HELP_MOUSE = 'Arrasta os cartões entre colunas para mudar o estado, ou usa o botão ⇄ no cartão. Com o teclado: foca a pega de um cartão, carrega em Espaço, usa as setas e Espaço para largar.';
const HELP_TOUCH = 'Desliza para o lado para mudar de coluna. Para mudar o estado, toca em ⇄ ou mantém o dedo num cartão e arrasta-o.';

/** "Como mover": as instruções num menu (antes ocupavam uma linha da página). */
function KanbanHelp() {
  return (
    <DropdownRoot>
      {/* Só o ícone; "Como mover" aparece ao passar o rato. */}
      <DropdownTrigger className={buttonClasses('ghost', 'icon', 'group relative')} aria-label="Como mover os cartões">
        <HelpCircle className="h-4 w-4" aria-hidden />
        <HoverHint>Como mover</HoverHint>
      </DropdownTrigger>
      <DropdownContent className="max-w-xs">
        <DropdownLabel>Como mover os cartões</DropdownLabel>
        <p className="px-2 pb-2 text-sm text-muted pointer-coarse:hidden">{HELP_MOUSE}</p>
        <p className="hidden px-2 pb-2 text-sm text-muted pointer-coarse:block">{HELP_TOUCH}</p>
      </DropdownContent>
    </DropdownRoot>
  );
}

const HELP_SEEN = 'vnd.kanban.help';

/** Na primeira visita, as instruções aparecem uma vez (com "Percebi" para fechar). */
function FirstVisitHelp() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- só no browser (localStorage)
      setShow(!window.localStorage.getItem(HELP_SEEN));
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  return (
    <div role="note" className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
      <p className="flex-1 text-muted">
        <span className="pointer-coarse:hidden">{HELP_MOUSE}</span>
        <span className="hidden pointer-coarse:inline">{HELP_TOUCH}</span>
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          try {
            window.localStorage.setItem(HELP_SEEN, '1');
          } catch {
            // Sem localStorage: fecha só desta vez.
          }
          setShow(false);
        }}
      >
        Percebi
      </Button>
    </div>
  );
}
