'use client';

import { LEAD_CHANNEL_META, LEAD_STATUS_META, formatCurrency, formatDate, formatPercent, serviceLabel, type ComparePeriod } from '@vndesign/core';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { CardLayoutButton, useCardLayout, visibleCards, type Board } from '@/components/leads/card-layout';
import { usePomodoroSettings } from '@/components/projects/pomodoro';
import { CollapseButton, setCollapsedKeys, useCollapsed } from '@/components/ui/collapse';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { ChannelIcon, SectorIconView, StatusIcon } from '@/components/icons/lead-icons';
import { ServiceIcon, useServiceCatalog } from '@/components/services/services';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { errorMessage } from '@/lib/api-client';
import { useDashboard, useRole, useSectors, useSettings, useTeamNames } from '@/lib/queries';
import { EmailStatsSection } from './email-stats';
import { LostReasonsCard } from './lost-reasons';
import { CohortFunnelCard } from './cohort-funnel';
import { ComparePeriodSwitch, PeriodCompareCard } from './period-compare';
import { PomodoroStatsSection } from './pomodoro-stats';
import { ProfitabilitySection } from './profitability-section';
import { TeamStatsSection } from './team-stats';

const euros = (v: number) => formatCurrency(v, { decimals: false });

/** As secções da página (cada pessoa escolhe a ordem e as que vê: "stats.sections"). */
const STATS_SECTIONS = ['resumo', 'funil', 'leads', 'emails', 'equipa', 'rentabilidade', 'pomodoro'] as const;
type StatsSection = (typeof STATS_SECTIONS)[number];
const SECTION_META: Record<StatsSection, { title: string; nav: string; description?: string }> = {
  resumo: { title: 'Resumo', nav: 'Resumo' },
  funil: { title: 'Funil e evolução', nav: 'Funil', description: 'Até onde chegam os leads e quantos entram por semana.' },
  leads: { title: 'Leads', nav: 'Leads', description: 'Por estado, setor, serviço e canal, e porque se perdem.' },
  emails: { title: 'Emails', nav: 'Emails', description: 'O que resulta e quando abrem os teus emails.' },
  equipa: { title: 'Equipa', nav: 'Equipa', description: 'O trabalho de cada pessoa.' },
  rentabilidade: {
    title: 'Rentabilidade',
    nav: 'Rentabilidade',
    description: 'Valor de cada projeto (proposta aceite, pagamentos ou valor estimado) a dividir pelas horas registadas.',
  },
  pomodoro: { title: 'Pomodoro', nav: 'Pomodoro', description: 'Os teus blocos de trabalho completos (o trabalho conta nas horas de cada projeto).' },
};
export const STATS_BOARD: Board<StatsSection> = {
  preference: 'stats.sections',
  defaults: STATS_SECTIONS,
  labels: Object.fromEntries(STATS_SECTIONS.map((k) => [k, SECTION_META[k].title])) as Record<StatsSection, string>,
  alwaysShown: [],
  description: 'A ordem das secções das Estatísticas e as que queres ver.',
};

const HEADER_TEXT = 'Os números da prospeção: funil, evolução, estados, setores, serviços e canais.';

/** Página Estatísticas: todos os números da prospeção (o Dashboard mostra só o essencial). */
export function StatsView() {
  const role = useRole();
  if (role === null) return <Skeleton className="h-24" />;
  // O prospetor vê só o seu trabalho (sem valores nem faturação).
  if (role === 'prospector') {
    return (
      <>
        <PageHeader title="Estatísticas" description="O teu trabalho de prospeção." />
        <TeamStatsSection />
      </>
    );
  }
  return <OwnerStats />;
}

/** Barra de cada secção: título, descrição e ⌄ (a escolha fica lembrada). */
function StatsGroup({ id, children }: { id: StatsSection; children: ReactNode }) {
  const [collapsed, setCollapsed] = useCollapsed(`stats:${id}`);
  const meta = SECTION_META[id];
  return (
    <section id={`est-${id}`} aria-labelledby={`est-${id}-titulo`} className="flex scroll-mt-32 flex-col gap-4 lg:scroll-mt-16">
      <div className="flex items-start gap-2 border-b border-border pb-2">
        <div className="min-w-0 flex-1">
          <h2 id={`est-${id}-titulo`} className="font-display text-xl font-semibold">
            {meta.title}
          </h2>
          {meta.description ? <p className="text-sm text-muted">{meta.description}</p> : null}
        </div>
        <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label={meta.title} />
      </div>
      {collapsed ? null : children}
    </section>
  );
}

/** Índice fixo: leva a cada secção (e abre-a se estava recolhida). */
function StatsIndex({ sections }: { sections: StatsSection[] }) {
  function go(id: StatsSection) {
    setCollapsedKeys([`stats:${id}`], false);
    requestAnimationFrame(() => document.getElementById(`est-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  return (
    <nav aria-label="Secções das estatísticas" className="sticky top-14 z-30 -my-1 bg-bg/95 py-2 backdrop-blur lg:top-0">
      <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {sections.map((id) => (
          <li key={id} className="shrink-0">
            <button
              type="button"
              onClick={() => go(id)}
              className="rounded-full border border-border px-3 py-1 text-sm text-muted hover:border-accent hover:text-fg pointer-coarse:py-1.5"
            >
              {SECTION_META[id].nav}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Desde sempre": os totais em números mais pequenos (os gráficos aparecem mais cedo). */
/** Parte de um total: percentagem a partir de 10; abaixo disso "2 de 3". */
const share = (part: number, whole: number) => (!whole ? '0 %' : whole >= 10 ? formatPercent(part / whole) : `${part} de ${whole}`);

function AllTimeCard({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <Card>
      <CardHeader title="Desde sempre" />
      <ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4" aria-label="Desde sempre">
        {items.map((i) => (
          <li key={i.label} className="flex flex-col gap-0.5 bg-surface px-4 py-2.5 last:rounded-br-xl">
            <span className="text-xs text-muted">{i.label}</span>
            <span className="text-lg font-semibold tabular">{i.value}</span>
            {i.hint ? <span className="text-xs text-muted">{i.hint}</span> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OwnerStats() {
  const { data: team } = useTeamNames();
  const catalog = useServiceCatalog();
  const { data, isLoading, error } = useDashboard();
  const { data: sectors } = useSectors();
  const { data: settings } = useSettings();
  const pomodoro = !!usePomodoroSettings();
  const [period, setPeriod] = useState<ComparePeriod>('month');
  const layout = useCardLayout(STATS_BOARD.preference);

  const available: Record<StatsSection, boolean> = {
    resumo: true,
    funil: true,
    leads: true,
    emails: true,
    equipa: (team?.length ?? 0) > 1,
    rentabilidade: !!settings?.features.projects,
    pomodoro,
  };
  const sections = visibleCards(STATS_BOARD, layout, (k) => available[k]);
  const t = data?.totals;
  const header = (
    <PageHeader
      title="Estatísticas"
      description={
        t && t.total
          ? `${t.total.toLocaleString('pt-PT')} leads · ${formatPercent(t.conversion_rate)} de conversão · ${euros(t.value_won)} ganhos · ${euros(t.value_pipeline)} em pipeline`
          : HEADER_TEXT
      }
      actions={
        <>
          <ComparePeriodSwitch period={period} onChange={setPeriod} />
          <CardLayoutButton board={STATS_BOARD} available={STATS_SECTIONS.filter((k) => available[k])} label="Organizar secções" />
        </>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage(error)}
        </p>
      </>
    );
  }
  if (isLoading || !data || !t) {
    return (
      <>
        {header}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </>
    );
  }

  if (t.total === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="Ainda não há leads">
            <p>Importa a tua folha ou cria o primeiro lead para veres aqui as estatísticas.</p>
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
      </>
    );
  }

  const funnelFirst = data.funnel[0]?.count ?? 0;
  const funnelBlock = (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
      {/* Pelo histórico (quem entrou no período e até onde chegou); o de baixo é o estado de agora. */}
      <CohortFunnelCard className="lg:col-span-2" />
      <Card>
        <CardHeader
          title="Funil de todos os leads"
          description="Etapa mais avançada a que cada lead já chegou (desde sempre). Quem saltou fases conta também nas anteriores."
        />
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
                // Com poucos leads, "x de y" em vez de uma percentagem que engana ("100 %" de 2).
                note: i === 0 ? undefined : `${share(f.count, funnelFirst)} do total · ${share(f.count, prev ?? 0)} da etapa anterior`,
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
    </div>
  );
  const leadsBlock = (
    <>
      {/* Distribuições: 2 × 2 no computador (cada uma com largura para os nomes). */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
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
              emptyText="Ainda não há leads com setor."
              limit={8}
              items={data.by_sector
                .filter((s) => s.count > 0)
                .sort((x, y) => Number(!x.id) - Number(!y.id) || y.count - x.count)
                .map((s) => ({
                  key: s.id ?? 'none',
                  muted: !s.id,
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
          <CardHeader title="Por serviço" description="Leads com interesse em cada serviço (e quantos já são clientes)." />
          <div className="p-4">
            <BarList
              caption="Leads por serviço de interesse"
              emptyText="Ainda não há leads com serviços de interesse."
              limit={8}
              items={(data.by_service ?? [])
                .filter((s) => s.count > 0)
                .sort((x, y) => y.count - x.count)
                .map((s) => ({
                  key: s.service,
                  label: serviceLabel(s.service, catalog.all),
                  mark: <ServiceIcon service={s.service} className="h-3.5 w-3.5 text-muted" />,
                  value: s.count,
                  note: s.won ? (s.won === 1 ? '1 cliente' : `${s.won} clientes`) : undefined,
                }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Por canal" />
          <div className="p-4">
            <BarList
              caption="Leads por canal"
              emptyText="Ainda não há leads com canal."
              limit={8}
              items={data.by_channel
                .filter((c) => c.count > 0)
                .sort((x, y) => Number(!x.channel) - Number(!y.channel) || y.count - x.count)
                .map((c) => ({
                  key: c.channel ?? 'none',
                  muted: !c.channel,
                  label: c.channel ? LEAD_CHANNEL_META[c.channel].label : 'Sem canal',
                  mark: c.channel ? <ChannelIcon channel={c.channel} className="h-3.5 w-3.5 text-muted" /> : undefined,
                  value: c.count,
                }))}
            />
          </div>
        </Card>
      </div>
      <LostReasonsCard />
    </>
  );

  const blocks: Record<StatsSection, ReactNode> = {
    resumo: (
      <>
        <PeriodCompareCard period={period} />
        <AllTimeCard
          items={[
            { label: 'Total de leads', value: t.total },
            { label: 'Leads ativos', value: t.active, hint: t.paused ? `${t.paused} em pausa` : undefined },
            { label: 'Clientes ganhos', value: t.won },
            { label: 'Sem interesse', value: t.lost },
            {
              label: 'Taxa de conversão',
              value: formatPercent(t.conversion_rate),
              hint: `${formatPercent(t.conversion_rate_contacted)} dos contactados (${t.contacted})`,
            },
            { label: 'Valor ganho', value: euros(t.value_won), hint: 'Soma dos clientes' },
            { label: 'Valor do pipeline', value: euros(t.value_pipeline), hint: 'Soma dos leads ativos' },
            { label: 'Valor total estimado', value: euros(t.value_total), hint: 'Soma de todos os leads' },
          ]}
        />
      </>
    ),
    funil: funnelBlock,
    leads: leadsBlock,
    emails: <EmailStatsSection />,
    equipa: <TeamStatsSection bare />,
    rentabilidade: <ProfitabilitySection bare />,
    pomodoro: <PomodoroStatsSection bare />,
  };

  return (
    <>
      {header}
      <div className="flex flex-col gap-6">
        {sections.length > 1 ? <StatsIndex sections={sections} /> : null}
        {sections.map((id) => (
          <StatsGroup key={id} id={id}>
            {blocks[id]}
          </StatsGroup>
        ))}
      </div>
    </>
  );
}
