'use client';

/**
 * Calendário do mês: prazos de entrega, reuniões, pagamentos previstos e
 * tarefas com prazo. No computador, a grelha do mês; no telemóvel, a lista
 * dos dias com alguma coisa.
 */
import { CALENDAR_EVENT_LABELS, CALENDAR_EVENT_TYPES, formatCurrency, leadPath, monthGrid, type CalendarEvent, type CalendarEventType } from '@vndesign/core';
import { BellRing, CalendarClock, ChevronLeft, ChevronRight, ListChecks, PackageCheck, Wallet, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { useProjectCalendar } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const TYPE_STYLE: Record<CalendarEventType, { icon: LucideIcon; className: string }> = {
  due: { icon: PackageCheck, className: 'bg-warning-soft text-warning font-medium' },
  meeting: { icon: CalendarClock, className: 'bg-accent-soft text-accent-text' },
  payment: { icon: Wallet, className: 'bg-success-soft text-success' },
  task: { icon: ListChecks, className: 'bg-surface-3 text-fg' },
  followup: { icon: BellRing, className: 'bg-danger-soft text-danger' },
};

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const monthFmt = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function eventText(e: CalendarEvent): string {
  const time = e.starts_at ? `${timeFmt.format(new Date(e.starts_at))} ` : '';
  const amount = e.amount !== null ? ` · ${formatCurrency(e.amount, { decimals: false })}` : '';
  return `${time}${e.type === 'due' ? 'Entrega' : e.title}${amount}`;
}

function EventChip({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  const { icon: Icon, className } = TYPE_STYLE[event.type];
  const label = `${CALENDAR_EVENT_LABELS[event.type]}: ${eventText(event)} — #${event.lead.number} ${event.lead.company_name}${event.done ? ' (feito)' : ''}`;
  return (
    <Link
      href={leadPath(event.lead)}
      title={label}
      aria-label={label}
      className={cn('flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight hover:opacity-80', className, event.done && 'line-through opacity-60')}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{compact ? event.lead.company_name : `${eventText(event)} · ${event.lead.company_name}`}</span>
    </Link>
  );
}

export function ProjectsCalendar({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  // Dias com tudo à vista (depois de carregar em "+N mais").
  const [expanded, setExpanded] = useState<string[]>([]);
  const days = useMemo(() => monthGrid(month), [month]);
  const { data: events, isLoading } = useProjectCalendar(days[0]!, days.at(-1)!);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);
  const inMonth = (d: string) => d.startsWith(month);
  const agenda = days.filter((d) => inMonth(d) && byDay.has(d));
  const title = monthFmt.format(new Date(`${month}-01T00:00:00Z`));

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto text-base font-semibold first-letter:uppercase" aria-live="polite">
          {title}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setMonth(today.slice(0, 7))} disabled={month === today.slice(0, 7)}>
          Hoje
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mês seguinte">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted" aria-label="Legenda">
        {CALENDAR_EVENT_TYPES.filter((t) => t !== 'followup').map((t) => {
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
        <>
          {/* Computador: grelha do mês. */}
          <div className="hidden p-4 md:block">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border" role="grid" aria-label={`Calendário de ${title}`}>
              {WEEKDAYS.map((w) => (
                <div key={w} role="columnheader" className="bg-surface-2 px-2 py-1.5 text-xs font-semibold text-muted">
                  {w}
                </div>
              ))}
              {days.map((d) => {
                const list = byDay.get(d) ?? [];
                return (
                  <div
                    key={d}
                    role="gridcell"
                    aria-label={dayFmt.format(new Date(`${d}T00:00:00Z`))}
                    className={cn('flex min-h-24 min-w-0 flex-col gap-1 bg-surface p-1.5', !inMonth(d) && 'bg-surface-2/60 opacity-60')}
                  >
                    <span
                      className={cn(
                        'self-start rounded-full px-1.5 text-xs tabular',
                        d === today ? 'bg-accent font-semibold text-accent-fg' : 'text-muted',
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    {(expanded.includes(d) ? list : list.slice(0, 3)).map((e) => (
                      <EventChip key={e.id} event={e} compact />
                    ))}
                    {list.length > 3 ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded.includes(d) ? expanded.filter((x) => x !== d) : [...expanded, d])}
                        className="self-start rounded px-1 text-[11px] text-muted hover:bg-surface-3 hover:text-fg"
                      >
                        {expanded.includes(d) ? 'Mostrar menos' : `+${list.length - 3} mais`}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Telemóvel: só os dias com alguma coisa. */}
          <div className="p-4 md:hidden">
            {agenda.length ? (
              <ol className="flex flex-col gap-3">
                {agenda.map((d) => (
                  <li key={d}>
                    <h3 className={cn('mb-1 text-sm font-semibold first-letter:uppercase', d === today && 'text-accent-text')}>
                      {dayFmt.format(new Date(`${d}T00:00:00Z`))}
                      {d === today ? ' · hoje' : ''}
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {byDay.get(d)!.map((e) => (
                        <li key={e.id}>
                          <EventChip event={e} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-sm text-muted">Nada marcado neste mês.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
