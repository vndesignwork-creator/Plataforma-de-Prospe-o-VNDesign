'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
} from '@vndesign/core';
import { GripVertical, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MultiSelectFilter } from '@/components/leads/multi-select';
import { Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { useBoard, useInvalidateLead, useSectors } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ChannelIcon, SectorIconView } from '@/components/icons/lead-icons';

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

function LeadCard({ lead, today, dragging }: { lead: Lead; today: string; dragging?: boolean }) {
  const overdue = lead.next_action_on !== null && lead.next_action_on < today;
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-3 text-sm shadow-sm',
        dragging && 'rotate-1 border-accent shadow-card',
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <Link
            href={`/leads/${lead.id}`}
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
      </div>
    </div>
  );
}

function SortableCard({ lead, today }: { lead: Lead; today: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      aria-roledescription="cartão arrastável"
      aria-label={`#${lead.number} ${lead.company_name}, ${LEAD_STATUS_META[lead.status].label}`}
    >
      <LeadCard lead={lead} today={today} />
    </li>
  );
}

function Column({ status, leads, today }: { status: LeadStatus; leads: Lead[]; today: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = LEAD_STATUS_META[status];
  const value = leads.reduce((s, l) => s + (l.estimated_value ?? 0), 0);
  return (
    <section
      aria-labelledby={`col-${status}`}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface-2/60',
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
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2" aria-label={`Leads em ${meta.label}`}>
          {leads.map((lead) => (
            <SortableCard key={lead.id} lead={lead} today={today} />
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

export function KanbanBoard() {
  const today = todayIso();
  const qc = useQueryClient();
  const invalidate = useInvalidateLead();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<string[]>([]);
  const [channel, setChannel] = useState<string[]>([]);
  const q = useDebouncedValue(search.trim());
  const query = { q: q || undefined, sector, channel };
  const { data: board, isLoading } = useBoard(query);
  const { data: sectors } = useSectors();

  // Estado local durante o arrastar (otimista); fora disso segue os dados do servidor.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const serverColumns = useMemo(() => (board ? toColumns(board) : null), [board]);
  const columns = dragColumns ?? serverColumns;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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

  function onDragStart({ active }: DragStartEvent) {
    if (!serverColumns) return;
    setActiveId(String(active.id));
    setDragColumns(structuredClone(serverColumns));
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
    const optimistic = { ...cols, [to]: list };
    qc.setQueryData(['board', query], (old: BoardColumn[] | undefined) =>
      old?.map((c) => ({ ...c, leads: optimistic[c.status], total: optimistic[c.status].length })),
    );
    setDragColumns(null);

    try {
      const { data: updated } = await api<{ data: Lead }>(`/leads/${active.id}/move`, {
        method: 'POST',
        body: { status: to, position },
      });
      if (original.status !== to) {
        const scheduled = to === 'contactado' && updated.next_action_on && updated.next_action_on !== original.next_action_on;
        toast.success(
          `#${updated.number} → ${LEAD_STATUS_META[to].label}${scheduled ? `. Follow-up agendado para ${formatDate(updated.next_action_on)}.` : '.'}`,
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      invalidate(String(active.id));
    }
  }

  const activeLead = activeId && columns ? Object.values(columns).flat().find((l) => l.id === activeId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
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
        <MultiSelectFilter
          label="Setor"
          value={sector}
          onChange={setSector}
          options={[...(sectors ?? []).map((s) => ({ value: s.id, label: s.name, icon: <SectorIconView sector={s} className="text-muted" /> })), { value: 'none', label: 'Sem setor' }]}
        />
        <MultiSelectFilter
          label="Canal"
          value={channel}
          onChange={setChannel}
          options={[...LEAD_CHANNELS.map((c) => ({ value: c, label: LEAD_CHANNEL_META[c].label, icon: <ChannelIcon channel={c} className="text-muted" /> })), { value: 'none', label: 'Sem canal' }]}
        />
      </div>
      <p className="text-sm text-muted">
        Arrasta os cartões entre colunas para mudar o estado. Com o teclado: foca um cartão, carrega em Espaço, usa as
        setas e Espaço para largar.
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
          <div className="-mx-4 flex min-h-[60dvh] gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {(Object.keys(columns) as LeadStatus[]).map((status) => (
              <Column key={status} status={status} leads={columns[status]} today={today} />
            ))}
          </div>
          <DragOverlay>{activeLead ? <LeadCard lead={activeLead} today={today} dragging /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
