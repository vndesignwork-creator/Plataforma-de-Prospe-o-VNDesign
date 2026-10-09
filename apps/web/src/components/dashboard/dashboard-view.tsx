'use client';

import {
  LEAD_CHANNEL_META,
  LEAD_STATUS_META,
  formatCurrency,
  formatDate,
  formatPercent,
  type Lead,
} from '@vndesign/core';
import { AlertCircle, CalendarClock, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { StatTile } from '@/components/charts/stat-tile';
import { FollowUpActions } from '@/components/follow-up/follow-up-actions';
import { StatusBadge } from '@/components/leads/badges';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { errorMessage } from '@/lib/api-client';
import { useDashboard, useSectors, useToday } from '@/lib/queries';
import { ChannelIcon, SectorIconView, StatusIcon } from '@/components/icons/lead-icons';

const euros = (v: number) => formatCurrency(v, { decimals: false });

function TodayGroup({ title, icon, leads, tone }: { title: string; icon: ReactNode; leads: Lead[]; tone?: 'danger' }) {
  if (!leads.length) return null;
  return (
    <section aria-label={title}>
      <h3 className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${tone === 'danger' ? 'text-danger' : ''}`}>
        {icon}
        {title} <span className="font-normal text-muted">({leads.length})</span>
      </h3>
      <ul className="divide-y divide-border">
        {leads.map((l) => (
          <li key={l.id} className="flex items-center gap-1">
            {/* Nome numa linha só para ele; data, ação e estado por baixo (no telemóvel o nome não fica cortado). */}
            <Link href={`/leads/${l.id}`} className="min-w-0 flex-1 rounded-md px-2 py-2 hover:bg-surface-2">
              <span className="block truncate text-sm font-medium">
                <span className="text-muted tabular">#{l.number}</span> {l.company_name}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className={`tabular ${tone === 'danger' ? 'font-semibold text-danger' : ''}`}>{formatDate(l.next_action_on)}</span>
                <span className="min-w-0 truncate">{l.next_action_text ?? 'Próxima ação'}</span>
                <StatusBadge status={l.status} />
              </span>
            </Link>
            <FollowUpActions lead={l} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodayCard() {
  const { data, isLoading } = useToday();
  const empty = data && !data.overdue.length && !data.due_today.length && !data.upcoming.length;
  return (
    <Card>
      <CardHeader title="Hoje" description={data ? `Follow-ups e próximas ações · ${formatDate(data.today)}` : undefined} />
      <div className="flex max-h-[26rem] flex-col gap-4 overflow-y-auto p-3">
        {isLoading ? <Skeleton className="h-40" /> : null}
        {empty ? <p className="px-2 py-6 text-center text-sm text-muted">Nada agendado para os próximos 7 dias. 🎉</p> : null}
        {data ? (
          <>
            <TodayGroup title="Em atraso" tone="danger" icon={<AlertCircle className="h-4 w-4" aria-hidden />} leads={data.overdue} />
            <TodayGroup title="Para hoje" icon={<CalendarClock className="h-4 w-4" aria-hidden />} leads={data.due_today} />
            <TodayGroup title="Próximos 7 dias" icon={<CalendarDays className="h-4 w-4" aria-hidden />} leads={data.upcoming} />
          </>
        ) : null}
      </div>
    </Card>
  );
}

export function DashboardView() {
  const { data, isLoading, error } = useDashboard();
  const { data: sectors } = useSectors();

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
        {errorMessage(error)}
      </p>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const t = data.totals;
  if (t.total === 0) {
    return (
      <Card>
        <EmptyState title="Ainda não há leads">
          <p>Importa a tua folha ou cria o primeiro lead para veres aqui o resumo.</p>
          <p className="mt-3 flex justify-center gap-3">
            <Link href="/importar" className="text-accent-text underline">
              Importar folha
            </Link>
            <Link href="/leads/novo" className="text-accent-text underline">
              Novo lead
            </Link>
          </p>
        </EmptyState>
      </Card>
    );
  }

  const funnelFirst = data.funnel[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Resumo (equivalente ao "📈 Resumo geral" da folha) */}
      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total de leads" value={t.total} />
        <StatTile label="Leads ativos" value={t.active} hint={t.paused ? `${t.paused} em pausa` : undefined} />
        <StatTile label="Clientes ganhos" value={t.won} />
        <StatTile label="Sem interesse" value={t.lost} />
        <StatTile
          label="Taxa de conversão"
          value={formatPercent(t.conversion_rate)}
          hint={`${formatPercent(t.conversion_rate_contacted)} dos contactados (${t.contacted})`}
        />
        <StatTile label="Valor ganho" value={euros(t.value_won)} hint="Soma dos clientes" />
        <StatTile label="Valor do pipeline" value={euros(t.value_pipeline)} hint="Soma dos leads ativos" />
        <StatTile label="Valor total estimado" value={euros(t.value_total)} hint="Soma de todos os leads" />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <TodayCard />

        <Card>
          <CardHeader title="Funil de conversão" description="Etapa mais avançada a que cada lead já chegou" />
          <div className="p-4">
            <BarList
              caption="Funil de conversão"
              items={data.funnel.map((f, i) => {
                const prev = i > 0 ? data.funnel[i - 1]!.count : null;
                return {
                  key: f.stage,
                  label: LEAD_STATUS_META[f.stage].label,
                  mark: <StatusIcon status={f.stage} className="h-3.5 w-3.5" />,
                  value: f.count,
                  note:
                    i === 0
                      ? undefined
                      : `${funnelFirst ? formatPercent(f.count / funnelFirst) : '0%'} do total · ${
                          prev ? formatPercent(f.count / prev) : '0%'
                        } da etapa anterior`,
                };
              })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Leads adicionados por semana" description="Pela data “Sugerido em” (ou de criação)" />
          <div className="p-4">
            <ColumnChart
              caption="Leads adicionados por semana, últimas 12 semanas"
              items={data.weekly.map((w) => ({
                key: w.week_start,
                label: formatDate(w.week_start).slice(0, 5),
                fullLabel: `Semana de ${formatDate(w.week_start)}`,
                value: w.count,
              }))}
            />
          </div>
        </Card>


        <Card>
          <CardHeader title="Por estado" />
          <div className="p-4">
            <BarList
              caption="Leads por estado"
              items={data.by_status.map((s) => ({
                key: s.status,
                label: LEAD_STATUS_META[s.status].label,
                mark: <StatusIcon status={s.status} className="h-3.5 w-3.5" />,
                value: s.count,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Por setor" />
          <div className="p-4">
            <BarList
              caption="Leads por setor"
              items={data.by_sector.map((s) => ({
                key: s.id ?? 'none',
                label: s.name,
                mark: s.id ? (
                  <SectorIconView sector={sectors?.find((x) => x.id === s.id) ?? { name: s.name }} className="h-3.5 w-3.5 text-muted" />
                ) : undefined,
                value: s.count,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Por canal" />
          <div className="p-4">
            <BarList
              caption="Leads por canal"
              items={data.by_channel.map((c) => ({
                key: c.channel ?? 'none',
                label: c.channel ? LEAD_CHANNEL_META[c.channel].label : 'Sem canal',
                mark: c.channel ? <ChannelIcon channel={c.channel} className="h-3.5 w-3.5 text-muted" /> : undefined,
                value: c.count,
              }))}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
