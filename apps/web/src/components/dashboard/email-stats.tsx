'use client';

/**
 * Estatísticas → Emails: que modelo resulta (abertura, clique e resposta) e
 * quando os teus emails são abertos (dia e hora, para saber quando enviar).
 */
import { WEEKDAY_NAMES, slotLabel, type EmailStats } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const PERIODS = [30, 90, 180, 365];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7h–22h
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

export function EmailStatsSection() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery({
    queryKey: ['stats-emails', days],
    queryFn: () => api<{ data: EmailStats }>('/stats/emails', { query: { days } }).then((r) => r.data),
  });
  const period = (
    <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período dos emails" className="h-8 w-auto py-0 text-sm">
      {PERIODS.map((d) => (
        <option key={d} value={d}>
          Últimos {d} dias
        </option>
      ))}
    </Select>
  );
  const totals = (data?.templates ?? []).reduce((s, t) => ({ sent: s.sent + t.sent, replied: s.replied + t.replied }), { sent: 0, replied: 0 });
  const bestReply = Math.max(0, ...(data?.templates ?? []).filter((t) => t.sent >= 5).map((t) => t.replied / t.sent));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Emails: o que resulta" description="Os emails enviados pela plataforma, por modelo" actions={period} />
        <div className="overflow-x-auto p-4">
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : !data?.templates.length ? (
            <p className="text-sm text-muted">Ainda não enviaste emails pela plataforma neste período.</p>
          ) : (
            <>
              <table className="w-full text-sm" aria-label="Emails por modelo">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="pb-2 font-medium">Modelo</th>
                    <th scope="col" className="pb-2 text-right font-medium">Enviados</th>
                    <th scope="col" className="pb-2 text-right font-medium">Abertos</th>
                    <th scope="col" className="pb-2 text-right font-medium">Clicaram</th>
                    <th scope="col" className="pb-2 text-right font-medium">Responderam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.templates.map((t) => {
                    const best = t.sent >= 5 && bestReply > 0 && t.replied / t.sent === bestReply;
                    return (
                      <tr key={t.template ?? '—'}>
                        <th scope="row" className="max-w-56 truncate py-2 pr-3 text-left font-medium" title={t.template ?? undefined}>
                          {t.template ?? <span className="text-muted">Escrito à mão</span>}
                        </th>
                        <td className="py-2 text-right tabular">{t.sent}</td>
                        <td className="py-2 text-right tabular">{data.tracked ? pct(t.opened, t.sent) : '—'}</td>
                        <td className="py-2 text-right tabular">{data.tracked ? pct(t.clicked, t.sent) : '—'}</td>
                        <td className={cn('py-2 text-right tabular', best && 'font-semibold text-success')} title={`${t.replied} de ${t.sent}`}>
                          {pct(t.replied, t.sent)}
                          {best ? ' ★' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">
                {totals.sent} emails · {pct(totals.replied, totals.sent)} com resposta. A resposta conta para o último email enviado ao lead (até 30 dias antes).
                {bestReply > 0 ? ' ★ = o modelo com mais respostas (com 5 envios ou mais).' : ''}
                {!data.tracked ? (
                  <>
                    {' '}
                    Para ver as aberturas e os cliques, liga o rastreio em{' '}
                    <Link href="/definicoes/funcionalidades" className="text-accent-text hover:underline">
                      Funcionalidades
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Quando abrem os teus emails" description="A primeira abertura de cada email, por dia e hora (hora de Lisboa)" />
        <div className="flex flex-col gap-3 p-4">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : !data?.tracked || !data.heatmap.some((d) => d.some((n) => n > 0)) ? (
            <p className="text-sm text-muted">Ainda não há aberturas registadas neste período.</p>
          ) : (
            <>
              {data.best.length ? (
                <p className="text-sm">
                  Mais abertos: <strong className="font-semibold">{data.best.map((b) => slotLabel(b)).join(' · ')}</strong>. Envia um pouco antes.
                </p>
              ) : null}
              <Heatmap grid={data.heatmap} />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs" aria-label="Aberturas por dia e hora">
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              Dia
            </th>
            {HOURS.map((h) => (
              <th key={h} scope="col" className="w-6 font-normal text-muted tabular">
                {h % 3 === 0 ? `${h}h` : ''}
                <span className="sr-only">{h % 3 === 0 ? '' : `${h}h`}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((hours, day) => (
            <tr key={day}>
              <th scope="row" className="pr-2 text-left font-normal text-muted capitalize">
                {WEEKDAY_NAMES[day]!.slice(0, 3)}
              </th>
              {HOURS.map((h) => {
                const n = hours[h] ?? 0;
                return (
                  <td
                    key={h}
                    title={`${WEEKDAY_NAMES[day]} ${h}h: ${n} ${n === 1 ? 'abertura' : 'aberturas'}`}
                    className="h-6 w-6 rounded-sm bg-surface-3"
                    style={n ? { backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(20 + (n / max) * 80)}%, transparent)` } : undefined}
                  >
                    <span className="sr-only">{n}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
