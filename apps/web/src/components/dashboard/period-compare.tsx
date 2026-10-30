'use client';

/**
 * Estatísticas: este mês (ou esta semana) até hoje contra o período anterior
 * até ao mesmo dia, com ↑/↓. Não são metas: só mostra se estás a melhorar.
 */
import { COMPARE_METRIC_LABELS, compareDelta, formatCurrency, formatDate, type ComparePeriod, type PeriodCompare } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const short = (iso: string) => formatDate(iso).slice(0, 5);

/** Mês | Semana (no topo da página Estatísticas). */
export function ComparePeriodSwitch({ period, onChange }: { period: ComparePeriod; onChange: (p: ComparePeriod) => void }) {
  return (
    <div role="group" aria-label="Período" className="inline-flex h-10 items-center rounded-lg border border-border-input bg-surface-2 p-0.5">
      {(['month', 'week'] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={period === p}
          onClick={() => onChange(p)}
          className={cn('inline-flex h-full items-center rounded-md px-3 text-sm', period === p ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg')}
        >
          {p === 'month' ? 'Mês' : 'Semana'}
        </button>
      ))}
    </div>
  );
}

export function PeriodCompareCard({ period }: { period: ComparePeriod }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats-compare', period],
    queryFn: () => api<{ data: PeriodCompare }>('/stats/compare', { query: { period } }).then((r) => r.data),
  });
  return (
    <Card>
      <CardHeader
        title={period === 'month' ? 'Este mês vs. o mês passado' : 'Esta semana vs. a semana passada'}
        description={
          data
            ? `${short(data.current.from)}–${short(data.current.to)} contra ${short(data.previous.from)}–${short(data.previous.to)} (até ao mesmo dia)`
            : 'Até ao mesmo dia do período anterior'
        }
      />
      {error ? (
        <p role="alert" className="m-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : isLoading || !data ? (
        <Skeleton className="m-4 h-24" />
      ) : (
        // Em linhas que se esticam: sem buracos quando o número de valores não enche a última linha.
        <ul className="flex flex-wrap gap-px bg-border" aria-label="Comparação">
          {data.metrics.map((m) => {
            const d = compareDelta(m.current, m.previous);
            const money = m.key === 'received';
            const fmt = (v: number) => (money ? formatCurrency(v, { decimals: false }) : v.toLocaleString('pt-PT'));
            const Icon = d.trend === 'up' ? ArrowUp : d.trend === 'down' ? ArrowDown : Minus;
            return (
              <li key={m.key} className="flex flex-[1_1_7.5rem] flex-col gap-1 bg-surface px-4 py-3" aria-label={`${COMPARE_METRIC_LABELS[m.key]}: ${fmt(m.current)}, antes ${fmt(m.previous)}`}>
                <span className="text-xs text-muted">{COMPARE_METRIC_LABELS[m.key]}</span>
                <span className="text-xl font-semibold tabular">{fmt(m.current)}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs tabular',
                    d.trend === 'up' ? 'text-success' : d.trend === 'down' ? 'text-danger' : 'text-muted',
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {/* Sem nada no período anterior: "novo" (em vez de "+5755 · antes 0"). */}
                  {!m.previous && m.current ? (
                    'novo'
                  ) : (
                    <>
                      {d.trend === 'same' ? 'igual' : `${d.diff > 0 ? '+' : '−'}${fmt(Math.abs(d.diff))}${d.percent !== null ? ` (${d.percent > 0 ? '+' : ''}${d.percent}%)` : ''}`}
                      <span className="text-muted">· antes {fmt(m.previous)}</span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
