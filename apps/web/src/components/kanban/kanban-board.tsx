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
  leadPath,
} from '@vndesign/core';
import { ArrowLeftRight, GripVertical, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { MultiSelectFilter } from '@/components/leads/multi-select';
import { Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { useBoard, useInvalidateLead, useSectors } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ChannelIcon, SectorIconView } from '@/components/icons/lead-icons';
import { ServiceIcons, serviceFilterOptions } from '@/components/services/services';
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
            <span className="text-muted tabular">#{lead.number}</span> {lead.company_name}
          </Link>
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
            {lead.sector ? (
              <span className="inline-flex items-center gap-1">
                <SectorIconView sector={lead.sector} className="h-3.5 w-3.5" />
                {lead.sector.name}
              </span>
            ) : null}
            {lead.city ? <span>{lead.city}</span> : null}
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
          {lead.estimated_value !== null ? (
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
        {/* No telemóvel a coluna cresce e faz-se scroll à página (um só scroll vertical); a partir de md cada coluna tem o seu. */}
        <ul
          ref={setNodeRef}
          className="flex min-h-24 flex-1 flex-col gap-2 p-2 md:overflow-y-auto md:overscroll-contain"
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
}: {
  columns: Columns;
  active: LeadStatus | null;
  onSelect: (status: LeadStatus) => void;
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
      className="sticky top-14 z-30 -mx-4 -mt-2 mb-1 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8"
    >
      <ul ref={listRef} className="relative flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {statuses.map((status) => {
          const meta = LEAD_STATUS_META[status];
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
                <span className="tabular opacity-80">{columns[status].length}</span>
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
  const qc = useQueryClient();
  const router = useRouter();
  const invalidate = useInvalidateLead();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<string[]>([]);
  const [channel, setChannel] = useState<string[]>([]);
  const [service, setService] = useState<string[]>([]);
  const q = useDebouncedValue(search.trim());
  const query = { q: q || undefined, sector, channel, service };
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

  return (
    <div className="flex flex-col gap-4">
      {/* Pesquisa e filtros: numa linha quando cabe; senão, os filtros passam juntos para a linha de baixo e repartem a largura. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[999_1_16rem]">
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
        <div className="flex flex-[1_1_auto] gap-2 *:flex-1 *:justify-between">
          <MultiSelectFilter
            label="Setor"
            value={sector}
            onChange={setSector}
            options={[...(sectors ?? []).map((s) => ({ value: s.id, label: s.name, icon: <SectorIconView sector={s} className="text-muted" /> })), { value: 'none', label: 'Sem setor' }]}
          />
          <MultiSelectFilter label="Serviço" value={service} onChange={setService} options={serviceFilterOptions()} />
          <MultiSelectFilter
            label="Canal"
            value={channel}
            onChange={setChannel}
            options={[...LEAD_CHANNELS.map((c) => ({ value: c, label: LEAD_CHANNEL_META[c].label, icon: <ChannelIcon channel={c} className="text-muted" /> })), { value: 'none', label: 'Sem canal' }]}
          />
        </div>
      </div>
      <p className="hidden text-sm text-muted pointer-fine:block">
        Arrasta os cartões entre colunas para mudar o estado, ou usa o botão{' '}
        <ArrowLeftRight className="inline h-3.5 w-3.5 align-[-2px]" role="img" aria-label="Mudar estado" />. Com o teclado: foca a
        pega de um cartão, carrega em Espaço, usa as setas e Espaço para largar.
      </p>
      <p className="hidden text-sm text-muted pointer-coarse:block">
        Desliza para o lado para mudar de coluna. Para mudar o estado, toca em{' '}
        <ArrowLeftRight className="inline h-3.5 w-3.5 align-[-2px]" role="img" aria-label="Mudar estado" /> ou mantém o dedo num
        cartão e arrasta-o.
      </p>

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
          <ColumnNav columns={columns} active={visible} onSelect={scrollToColumn} />
          {/* Computador (md+): altura fixa, cada coluna tem o seu scroll e a barra horizontal fica à vista.
              Telemóvel: as colunas crescem (scroll vertical da página) e deslizam para o lado com encaixe. */}
          <div
            ref={scrollerRef}
            onScroll={onBoardScroll}
            className={cn(
              'relative -mx-4 flex scroll-mt-28 items-start gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 scroll-px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:h-[calc(100dvh-18.5rem)] md:min-h-96 md:items-stretch lg:-mx-8 lg:scroll-mt-16 lg:scroll-px-8 lg:px-8',
              activeId ? 'snap-none' : 'snap-x snap-mandatory md:snap-none',
            )}
          >
            {statuses.map((status) => (
              <Column key={status} status={status} leads={columns[status]} today={today} statuses={statuses} onMove={moveTo} />
            ))}
          </div>
          <DragOverlay>{activeLead ? <LeadCard lead={activeLead} today={today} dragging /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
