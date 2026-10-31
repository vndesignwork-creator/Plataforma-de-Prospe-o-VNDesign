'use client';

/**
 * Funil por período: dos leads que entraram nos últimos 30 dias / 3 meses / 12 meses,
 * quantos chegaram a cada fase, a percentagem que passou da anterior e quanto tempo,
 * em média, demorou essa passagem (pela linha do tempo).
 */
import { FUNNEL_WINDOWS, FUNNEL_WINDOW_LABELS, LEAD_STATUS_META, formatDate, type CohortFunnel, type FunnelWindow } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StatusIcon } from '@/components/icons/lead-icons';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { rovingKeyDown, rovingTabIndex } from '@/lib/roving';
import { cn } from '@/lib/utils';

const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)} %`;
/** Com poucos leads uma percentagem engana ("100 %" de 2): até 10, mostra "2 de 3". */
const MIN_FOR_PERCENT = 10;
const passed = (part: number, whole: number) => (whole >= MIN_FOR_PERCENT ? pct(part, whole) : `${part} de ${whole}`);
const daysText = (d: number) => (d < 1 ? 'menos de 1 dia' : `${d.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} dia${d === 1 ? '' : 's'}`);

export function CohortFunnelCard({ className }: { className?: string }) {
  const [days, setDays] = useState<FunnelWindow>('90');
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'funnel', days],
    queryFn: () => api<{ data: CohortFunnel }>('/stats/funnel', { query: { days } }).then((r) => r.data),
  });
  const first = data?.stages[0]?.reached ?? 0;

  return (
    <Card id="funil" className={cn('scroll-mt-20', className)}>
      <CardHeader
        title="Funil dos leads novos"
        description={
          data ? `Dos leads que entraram desde ${formatDate(data.from)}: até onde chegaram e em quanto tempo` : 'Até onde chegaram e em quanto tempo'
        }
        actions={
          <div role="radiogroup" aria-label="Período do funil" onKeyDown={rovingKeyDown} className="inline-flex rounded-lg bg-surface-2 p-0.5 text-sm">
            {FUNNEL_WINDOWS.map((w, i) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={days === w}
                tabIndex={rovingTabIndex(days === w, i)}
                onClick={() => setDays(w)}
                className={cn('rounded-md px-2.5 py-1 font-medium', days === w ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
              >
                {FUNNEL_WINDOW_LABELS[w]}
              </button>
            ))}
          </div>
        }
      />
      {isLoading ? <Skeleton className="m-4 h-40" /> : null}
      {error ? <p className="p-4 text-sm text-danger">{errorMessage(error)}</p> : null}
      {data && !first ? <p className="p-4 text-sm text-muted">Nenhum lead novo neste período.</p> : null}
      {data && first ? (
        <ol className="flex flex-col p-2" aria-label="Funil dos leads novos">
          {data.stages.map((s, i) => {
            const prev = i > 0 ? data.stages[i - 1]!.reached : null;
            return (
              <li
                key={s.stage}
                className="grid grid-cols-[1rem_minmax(0,9.5rem)_2.75rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 rounded-md px-2 py-1.5 text-sm sm:grid-cols-[1rem_minmax(0,9.5rem)_2.75rem_minmax(0,1fr)_minmax(0,14rem)]"
              >
                <StatusIcon status={s.stage} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{LEAD_STATUS_META[s.stage].label}</span>
                <span className="text-right font-medium tabular">{s.reached}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(s.reached / first) * 100}%` }} />
                </span>
                {/* Telemóvel: a passagem e o tempo vão para a linha de baixo. */}
                <span className="col-start-2 col-end-5 text-xs text-muted tabular sm:col-start-auto sm:col-end-auto sm:text-right">
                  {prev ? `${passed(s.reached, prev)} da fase anterior` : `${s.reached} leads novos`}
                  {s.avg_days !== null ? ` · ≈ ${daysText(s.avg_days)}` : ''}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {data && first ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          Um lead que saltou fases (ex.: passou logo a Cliente) conta também nas anteriores. Com menos de {MIN_FOR_PERCENT} leads numa fase, mostra “x de y” em
          vez da percentagem.
        </p>
      ) : null}
    </Card>
  );
}
