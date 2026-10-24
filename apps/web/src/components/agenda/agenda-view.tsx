'use client';

/**
 * Agenda da semana (segunda a domingo): os compromissos com data — reuniões,
 * entregas, pagamentos e tarefas — e, por dia, quantos follow-ups há (abrem-se
 * com um toque; o trabalho de os fazer é na Prospeção). Em cima, o resumo da
 * semana e os atrasados ("Pôr em dia"). Um dia com follow-ups a mais pode
 * "Distribuir" pelos dias úteis seguintes; cada follow-up muda de dia ou sai da
 * agenda, sempre com "Anular". No telemóvel abre no dia de hoje.
 */
import {
  AGENDA_DAY_LIMIT,
  CALENDAR_EVENT_LABELS,
  CALENDAR_EVENT_TYPES,
  addDays,
  agendaSummary,
  formatCurrency,
  isWeekend,
  leadPath,
  spreadFollowUps,
  todayIso,
  weekStart,
  type CalendarEvent,
  type RescheduleInput,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Shuffle, Target, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { TYPE_STYLE } from '@/components/projects/projects-calendar';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { DateMenu } from '@/components/ui/date-menu';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { api, errorMessage } from '@/lib/api-client';
import { useProjectCalendar, useReschedule, useSettings } from '@/lib/queries';
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
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Em atraso: follow-ups e tarefas por fazer de antes de hoje. */
const isOverdue = (e: CalendarEvent, today: string) => e.date < today && (e.type === 'followup' || (e.type === 'task' && !e.done));

export function AgendaView() {
  const [today] = useState(() => todayIso());
  const [start, setStart] = useState(() => weekStart(todayIso()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const end = days[6]!;
  const current = start === weekStart(today);
  const { data: events, isLoading } = useProjectCalendar(start, end, true, true, current);
  const { data: settings } = useSettings();
  const workWeekends = settings?.work_weekends ?? false;
  const qc = useQueryClient();
  const reschedule = useReschedule();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Telemóvel: só o dia de hoje aberto (os outros abrem-se com um toque).
  const [open, setOpen] = useState<Set<string>>(() => new Set([todayIso()]));

  const overdue = useMemo(() => (current ? (events ?? []).filter((e) => isOverdue(e, today)) : []), [events, current, today]);
  const week = useMemo(() => (events ?? []).filter((e) => e.date >= start && !overdue.includes(e)), [events, start, overdue]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of week) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [week]);
  const summary = agendaSummary(week);

  function changeWeek(next: string) {
    setStart(next);
    setOpen(new Set(next === weekStart(today) ? [today] : []));
  }

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
    qc.setQueryData<CalendarEvent[]>(['project-calendar', start, end, true, current], (old) =>
      old?.map((e) => (e.id === event.id ? { ...e, date } : e)),
    );
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
    qc.setQueryData<CalendarEvent[]>(['project-calendar', start, end, true, current], (old) =>
      old?.map((e) => (e.id === event.id ? { ...e, done } : e)),
    );
    try {
      await api(`/tasks/${recordId(event)}`, { method: 'PATCH', body: { done } });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      refresh();
    }
  }

  /** Várias datas de uma vez (reschedule), com "Anular". */
  async function bulk(apply: RescheduleInput, undo: RescheduleInput, message: string) {
    try {
      await reschedule.mutateAsync(apply);
      toast.success(message, {
        action: {
          label: 'Anular',
          // mutateAsync: o aviso pode ficar depois de o cartão desaparecer.
          onClick: () =>
            reschedule.mutateAsync(undo).then(
              () => toast.success('Datas repostas.'),
              (e: unknown) => toast.error(errorMessage(e)),
            ),
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function clearFollowUp(event: CalendarEvent) {
    const id = recordId(event);
    void bulk(
      { leads: [{ id, next_action_on: null }] },
      { leads: [{ id, next_action_on: event.date }] },
      `Follow-up de #${event.lead.number} ${event.lead.company_name} tirado da agenda.`,
    );
  }

  function distribute(day: string, followups: CalendarEvent[]) {
    const counts: Record<string, number> = {};
    for (const [d, list] of byDay) counts[d] = list.filter((e) => e.type === 'followup').length;
    const moves = spreadFollowUps(
      followups.map((e) => recordId(e)),
      day,
      counts,
      { workWeekends },
    );
    if (!moves.length) return;
    void bulk(
      { leads: moves.map((m) => ({ id: m.id, next_action_on: m.date })) },
      { leads: moves.map((m) => ({ id: m.id, next_action_on: day })) },
      `${plural(moves.length, 'follow-up passou', 'follow-ups passaram')} para os dias seguintes (no máximo ${AGENDA_DAY_LIMIT} por dia).`,
    );
  }

  function catchUp(date: string | null) {
    if (!date) return;
    const leads = overdue.filter((e) => e.type === 'followup');
    const tasks = overdue.filter((e) => e.type === 'task');
    void bulk(
      { leads: leads.map((e) => ({ id: recordId(e), next_action_on: date })), tasks: tasks.map((e) => ({ id: recordId(e), due_on: date })) },
      { leads: leads.map((e) => ({ id: recordId(e), next_action_on: e.date })), tasks: tasks.map((e) => ({ id: recordId(e), due_on: e.date })) },
      `${plural(overdue.length, 'atrasado passou', 'atrasados passaram')} para ${date === today ? 'hoje' : dayLong.format(asDate(date))}.`,
    );
  }

  const find = (id: string | null) => (id ? (events ?? []).find((e) => e.id === id) : undefined);
  const itemProps = (e: CalendarEvent) => ({
    event: e,
    days,
    onMove: (date: string) => void move(e, date),
    onToggle: () => void toggleTask(e),
    onClear: e.type === 'followup' ? () => clearFollowUp(e) : undefined,
    onDragStart: () => setDragging(e.id),
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto text-base font-semibold" aria-live="polite">
          {weekTitle(start)}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => changeWeek(weekStart(today))} disabled={current}>
          Esta semana
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeWeek(addDays(start, -7))} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeWeek(addDays(start, 7))} aria-label="Semana seguinte">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {events ? <WeekSummary summary={summary} /> : null}

      {overdue.length ? (
        <OverdueBar today={today} events={overdue} onCatchUp={catchUp} itemProps={itemProps} />
      ) : null}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted max-md:hidden" aria-label="Legenda">
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
        <div className="grid gap-2 p-4 md:grid-cols-7" role="list" aria-label="Dias da semana">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const followups = list.filter((e) => e.type === 'followup');
            const others = list.filter((e) => e.type !== 'followup');
            const isToday = d === today;
            const off = !workWeekends && isWeekend(d);
            const expanded = open.has(d);
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
                  off && !list.length && 'opacity-60',
                  over === d && 'bg-accent-soft/40',
                )}
              >
                {/* Telemóvel: o cabeçalho abre e fecha o dia; no computador estão todos abertos. */}
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen((s) => (s.has(d) ? new Set([...s].filter((x) => x !== d)) : new Set([...s, d])))}
                  className="flex items-baseline gap-1.5 text-left text-xs font-semibold text-muted md:pointer-events-none"
                >
                  <span className={cn('capitalize', isToday && 'text-accent-text')}>{dayName.format(asDate(d)).replace('.', '')}</span>
                  <span className="text-sm text-fg tabular">{asDate(d).getUTCDate()}</span>
                  {isToday ? <span className="font-medium text-accent-text">· hoje</span> : null}
                  <span className="ml-auto font-normal md:hidden">
                    {list.length ? plural(list.length, 'item', 'itens') : off ? 'fim de semana' : 'nada'}
                  </span>
                  {list.length ? <ChevronDown className={cn('h-3.5 w-3.5 self-center transition-transform md:hidden', expanded && 'rotate-180')} aria-hidden /> : null}
                </button>
                <div className={cn('flex flex-col gap-1.5', !expanded && 'max-md:hidden')}>
                  {others.map((e) => (
                    <AgendaItem key={e.id} {...itemProps(e)} />
                  ))}
                  {followups.length ? (
                    <FollowUpGroup
                      key={`${d}-${followups.length}`}
                      day={d}
                      today={today}
                      events={followups}
                      onDistribute={d >= today && followups.length > AGENDA_DAY_LIMIT ? () => distribute(d, followups) : undefined}
                      itemProps={itemProps}
                    />
                  ) : null}
                  {!list.length && off ? <p className="text-xs text-muted max-md:hidden">Fim de semana</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

type ItemProps = Parameters<typeof AgendaItem>[0];

/** "3 reuniões · 2 entregas · 1 250 € a receber · 5 tarefas · 24 follow-ups". */
function WeekSummary({ summary }: { summary: ReturnType<typeof agendaSummary> }) {
  const parts = [
    summary.meetings ? plural(summary.meetings, 'reunião', 'reuniões') : '',
    summary.dues ? plural(summary.dues, 'entrega', 'entregas') : '',
    summary.receivable ? `${formatCurrency(summary.receivable, { decimals: false })} a receber` : '',
    summary.tasks ? plural(summary.tasks, 'tarefa', 'tarefas') : '',
    summary.followups ? plural(summary.followups, 'follow-up', 'follow-ups') : '',
  ].filter(Boolean);
  return (
    <p className="border-b border-border px-4 py-2.5 text-sm" aria-label="Resumo da semana">
      <span className="text-muted">Esta semana: </span>
      <strong className="font-semibold">{parts.length ? parts.join(' · ') : 'nada marcado'}</strong>
    </p>
  );
}

/** Em atraso (follow-ups e tarefas de dias anteriores): "Pôr em dia" muda todos de uma vez. */
function OverdueBar({
  today,
  events,
  onCatchUp,
  itemProps,
}: {
  today: string;
  events: CalendarEvent[];
  onCatchUp: (date: string | null) => void;
  itemProps: (e: CalendarEvent) => ItemProps;
}) {
  const [show, setShow] = useState(false);
  const followups = events.filter((e) => e.type === 'followup').length;
  const tasks = events.length - followups;
  const what = [followups ? plural(followups, 'follow-up', 'follow-ups') : '', tasks ? plural(tasks, 'tarefa', 'tarefas') : ''].filter(Boolean);
  return (
    <section aria-label="Em atraso" className="mx-4 mt-3 flex flex-col gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={show} onClick={() => setShow(!show)} className="mr-auto inline-flex items-center gap-1.5 text-left">
          <ChevronDown className={cn('h-4 w-4 transition-transform', !show && '-rotate-90')} aria-hidden />
          <span className="font-medium text-danger">Em atraso:</span> {what.join(' e ')}
        </button>
        <DateMenu
          today={today}
          heading="Passar os atrasados para"
          triggerClassName={buttonClasses('outline', 'sm')}
          label={
            <>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Pôr em dia
            </>
          }
          onPick={onCatchUp}
        />
      </div>
      {show ? (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {events.map((e) => (
            <AgendaItem key={e.id} {...itemProps(e)} showDate />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Os follow-ups de um dia numa linha ("12 follow-ups"); abrem-se com um toque. */
function FollowUpGroup({
  day,
  today,
  events,
  onDistribute,
  itemProps,
}: {
  day: string;
  today: string;
  events: CalendarEvent[];
  onDistribute?: () => void;
  itemProps: (e: CalendarEvent) => ItemProps;
}) {
  // Poucos: à vista; muitos: recolhidos.
  const [show, setShow] = useState(events.length <= 3);
  const { className } = TYPE_STYLE.followup;
  const label = plural(events.length, 'follow-up', 'follow-ups');
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={`Follow-ups de ${dayLong.format(asDate(day))}`}>
      <button
        type="button"
        aria-expanded={show}
        onClick={() => setShow(!show)}
        className={cn('flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium', className)}
      >
        <BellRing className="h-3 w-3 shrink-0" aria-hidden />
        <span className="flex-1">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', show && 'rotate-180')} aria-hidden />
      </button>
      {onDistribute ? (
        <Button size="sm" variant="outline" className="h-7 justify-center px-2 text-xs" onClick={onDistribute} title={`Deixa ${AGENDA_DAY_LIMIT} neste dia e passa os outros para os dias úteis seguintes`}>
          <Shuffle className="h-3.5 w-3.5" aria-hidden /> Distribuir
        </Button>
      ) : null}
      {day === today ? (
        <Link href="/prospecao" className="inline-flex items-center gap-1 px-1 text-xs text-accent-text hover:underline">
          <Target className="h-3.5 w-3.5" aria-hidden /> Fazer na Prospeção
        </Link>
      ) : null}
      {show ? events.map((e) => <AgendaItem key={e.id} {...itemProps(e)} />) : null}
    </div>
  );
}

function AgendaItem({
  event,
  days,
  showDate,
  onMove,
  onToggle,
  onClear,
  onDragStart,
  onDragEnd,
}: {
  event: CalendarEvent;
  days: string[];
  showDate?: boolean;
  onMove: (date: string) => void;
  onToggle: () => void;
  onClear?: () => void;
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
          {showDate ? `${dayShort.format(asDate(event.date))} · ` : ''}
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
              {onClear ? (
                <>
                  <DropdownSeparator />
                  <DropdownItem onSelect={onClear}>
                    <X className="h-4 w-4 text-muted" aria-hidden /> Tirar da agenda
                  </DropdownItem>
                </>
              ) : null}
            </DropdownContent>
          </DropdownRoot>
        ) : null}
      </span>
    </article>
  );
}
