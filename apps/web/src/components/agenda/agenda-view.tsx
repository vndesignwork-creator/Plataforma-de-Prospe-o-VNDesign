'use client';

/**
 * Agenda da semana (segunda a domingo): follow-ups, tarefas, reuniões, entregas
 * e pagamentos previstos, com os mesmos dados do calendário dos Projetos.
 * Tarefas, follow-ups e entregas mudam de dia arrastando (computador) ou com
 * "Mudar o dia" (telemóvel e teclado); as tarefas marcam-se feitas aqui.
 * O "Hoje" do Dashboard continua a ser a lista do que é urgente.
 */
import {
  CALENDAR_EVENT_LABELS,
  CALENDAR_EVENT_TYPES,
  addDays,
  formatCurrency,
  leadPath,
  todayIso,
  weekStart,
  type CalendarEvent,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { TYPE_STYLE } from '@/components/projects/projects-calendar';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { api, errorMessage } from '@/lib/api-client';
import { useProjectCalendar } from '@/lib/queries';
import { cn } from '@/lib/utils';

const dayName = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', timeZone: 'UTC' });
const dayLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayShort = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** Só estes mudam de dia aqui (as reuniões e os pagamentos mudam-se na ficha). */
const MOVABLE = new Set<CalendarEvent['type']>(['task', 'followup', 'due']);

function weekTitle(start: string): string {
  const end = addDays(start, 6);
  const fmt = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${dayShort.format(asDate(start))} – ${fmt.format(asDate(end))}`;
}

/** id do calendário ("task-<uuid>") → o id do registo. */
const recordId = (e: CalendarEvent) => e.id.slice(e.id.indexOf('-') + 1);

export function AgendaView() {
  const [today] = useState(() => todayIso());
  const [start, setStart] = useState(() => weekStart(todayIso()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const end = days[6]!;
  const { data: events, isLoading } = useProjectCalendar(start, end, true, true);
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['project-calendar'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  }

  /** Muda o dia (otimista: o cartão muda logo de coluna); "Anular" volta ao dia de antes. */
  async function move(event: CalendarEvent, date: string, undo = false) {
    if (date === event.date || !MOVABLE.has(event.type)) return;
    const key = ['project-calendar', start, end, true];
    qc.setQueryData<CalendarEvent[]>(key, (old) => old?.map((e) => (e.id === event.id ? { ...e, date } : e)));
    const id = recordId(event);
    try {
      if (event.type === 'task') await api(`/tasks/${id}`, { method: 'PATCH', body: { due_on: date } });
      else if (event.type === 'followup') await api(`/leads/${id}`, { method: 'PATCH', body: { next_action_on: date } });
      else await api(`/leads/${id}/project`, { method: 'PATCH', body: { due_on: date } });
      if (undo) toast.success(`${CALENDAR_EVENT_LABELS[event.type]} voltou a ${dayLong.format(asDate(date))}.`);
      else {
        toast.success(`${CALENDAR_EVENT_LABELS[event.type]} passou para ${dayLong.format(asDate(date))}.`, {
          action: { label: 'Anular', onClick: () => void move({ ...event, date }, event.date, true) },
        });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      refresh();
    }
  }

  async function toggleTask(event: CalendarEvent) {
    const done = !event.done;
    qc.setQueryData<CalendarEvent[]>(['project-calendar', start, end, true], (old) => old?.map((e) => (e.id === event.id ? { ...e, done } : e)));
    try {
      await api(`/tasks/${recordId(event)}`, { method: 'PATCH', body: { done } });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      refresh();
    }
  }

  const find = (id: string | null) => (id ? (events ?? []).find((e) => e.id === id) : undefined);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto text-base font-semibold" aria-live="polite">
          {weekTitle(start)}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setStart(weekStart(today))} disabled={start === weekStart(today)}>
          Esta semana
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setStart(addDays(start, -7))} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setStart(addDays(start, 7))} aria-label="Semana seguinte">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted" aria-label="Legenda">
        {CALENDAR_EVENT_TYPES.map((t) => {
          const { icon: Icon, className } = TYPE_STYLE[t];
          return (
            <li key={t} className="inline-flex items-center gap-1.5">
              <span className={cn('inline-flex rounded p-0.5', className)}>
                <Icon className="h-3 w-3" aria-hidden />
              </span>
              {CALENDAR_EVENT_LABELS[t]}
            </li>
          );
        })}
      </ul>

      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-80" />
        </div>
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-7 md:gap-2" role="list" aria-label="Dias da semana">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const isToday = d === today;
            return (
              <section
                key={d}
                role="listitem"
                aria-label={dayLong.format(asDate(d))}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOver(d);
                }}
                onDragLeave={() => setOver((o) => (o === d ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  const event = find(dragging);
                  setDragging(null);
                  setOver(null);
                  if (event) void move(event, d);
                }}
                className={cn(
                  'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border p-2 md:min-h-64',
                  isToday && 'border-accent',
                  over === d && 'bg-accent-soft/40',
                  // Telemóvel: dias sem nada ficam numa linha (exceto hoje).
                  !list.length && !isToday && 'max-md:py-1.5',
                )}
              >
                <h3 className={cn('flex items-baseline gap-1.5 text-xs font-semibold text-muted', isToday && 'text-accent-text')}>
                  <span className="capitalize">{dayName.format(asDate(d)).replace('.', '')}</span>
                  <span className="text-sm text-fg tabular">{asDate(d).getUTCDate()}</span>
                  {isToday ? <span className="font-medium">· hoje</span> : null}
                  {!list.length ? <span className="font-normal md:hidden">· nada</span> : null}
                </h3>
                {list.map((e) => (
                  <AgendaItem
                    key={e.id}
                    event={e}
                    days={days}
                    onMove={(date) => void move(e, date)}
                    onToggle={() => void toggleTask(e)}
                    onDragStart={() => setDragging(e.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AgendaItem({
  event,
  days,
  onMove,
  onToggle,
  onDragStart,
  onDragEnd,
}: {
  event: CalendarEvent;
  days: string[];
  onMove: (date: string) => void;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { icon: Icon, className } = TYPE_STYLE[event.type];
  const movable = MOVABLE.has(event.type);
  const time = event.starts_at ? timeFmt.format(new Date(event.starts_at)) : null;
  const title = event.type === 'due' ? 'Entrega do projeto' : event.title;
  const amount = event.amount !== null ? ` · ${formatCurrency(event.amount, { decimals: false })}` : '';
  const anchor = event.type === 'task' ? '#tarefas' : event.type === 'due' ? '#projeto' : '';
  return (
    <article
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', event.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      aria-label={`${CALENDAR_EVENT_LABELS[event.type]}: ${title} — #${event.lead.number} ${event.lead.company_name}`}
      className={cn('flex flex-col gap-1 rounded-md px-2 py-1.5 text-xs', className, movable && 'cursor-grab active:cursor-grabbing', event.done && 'opacity-60')}
    >
      <span className="flex items-start gap-1.5">
        {event.type === 'task' ? (
          <input
            type="checkbox"
            checked={event.done}
            onChange={onToggle}
            aria-label={event.done ? `Reabrir: ${title}` : `Concluir: ${title}`}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer"
          />
        ) : (
          <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        )}
        <span className={cn('min-w-0 flex-1 font-medium break-words', event.done && 'line-through')}>
          {time ? `${time} ` : ''}
          {title}
          {amount}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <Link href={`${leadPath(event.lead)}${anchor}`} className="min-w-0 flex-1 truncate opacity-80 hover:underline" draggable={false}>
          #{event.lead.number} {event.lead.company_name}
        </Link>
        {movable ? (
          <DropdownRoot>
            <DropdownTrigger
              className="shrink-0 rounded p-0.5 opacity-70 hover:bg-black/10 hover:opacity-100 pointer-coarse:p-1.5"
              aria-label={`Mudar o dia: ${title}`}
              title="Mudar o dia"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownLabel>Mudar para</DropdownLabel>
              {[...days, addDays(days[0]!, 7)].map((d, i) =>
                d === event.date ? null : (
                  <DropdownItem key={d} onSelect={() => onMove(d)}>
                    {i === 7 ? `Próxima semana (${dayShort.format(asDate(d))})` : <span className="capitalize">{dayLong.format(asDate(d))}</span>}
                  </DropdownItem>
                ),
              )}
            </DropdownContent>
          </DropdownRoot>
        ) : null}
      </span>
    </article>
  );
}
