'use client';

/**
 * Topo do Dashboard: saudação com a data e o essencial do dia (clicável), as
 * ações rápidas e os números (este mês, 30 dias ou sempre) com a comparação com
 * o período anterior. Os números organizam-se como os cartões.
 */
import {
  PROJECT_STAGE_LABELS,
  formatClock,
  formatCurrency,
  formatDate,
  formatPercent,
  leadPath,
  projectLabel,
  workingOnPicks,
  type Dashboard,
  type DashboardPeriod,
} from '@vndesign/core';
import { ArrowDownRight, ArrowUpRight, Minus, Plus, Target, Timer } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { CardLayoutButton, useCardLayout, visibleCards, type Board } from '@/components/leads/card-layout';
import { buttonClasses } from '@/components/ui/button';
import { useDashboardPeriod, useMe, usePreference, useProjects, useRunningTimer, useSettings, useToday } from '@/lib/queries';
import { WORKING_ON_PREFERENCE } from '@/components/projects/working-on-button';
import { useElapsed } from '@/components/projects/time-section';
import { cn } from '@/lib/utils';

const euros = (v: number) => formatCurrency(v, { decimals: false });
const lisbon = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', ...opts });

function greeting(now: Date) {
  const hour = Number(lisbon({ hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 12 ? 'Bom dia' : hour < 20 ? 'Boa tarde' : 'Boa noite';
}

/** "Bom dia, Ana · quinta, 30/10 · 14:35" (a hora só no computador) e, por baixo, o que há para hoje (cada parte leva à lista certa). */
export function DashboardHeader({ organize }: { organize?: ReactNode }) {
  const { data: me } = useMe();
  const { data: today } = useToday();
  const { data: settings } = useSettings();
  // Só no browser (hora e dia de Lisboa).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a hora só no browser (evita diferenças com o servidor)
    setNow(new Date());
    // A hora certa no topo (atualiza a cada 15 segundos).
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const first = me?.profile.name.split(' ')[0];
  const day = now ? lisbon({ weekday: 'long', day: '2-digit', month: '2-digit' }).format(now).replace(',', '') : null;
  const time = now ? lisbon({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now) : null;

  const followUpsToday = today ? today.due_today.length : 0;
  const tasksToday = today?.tasks ? today.tasks.due_today.length + today.tasks.overdue.length : 0;
  const parts: { text: string; href: string; tone?: 'danger' }[] = today
    ? [
        followUpsToday ? { text: `${followUpsToday} follow-up${followUpsToday === 1 ? '' : 's'} para hoje`, href: '/leads?due=today' } : null,
        today.overdue.length ? { text: `${today.overdue.length} em atraso`, href: '/leads?due=overdue', tone: 'danger' as const } : null,
        tasksToday ? { text: `${tasksToday} tarefa${tasksToday === 1 ? '' : 's'} para hoje`, href: '/tarefas' } : null,
      ].filter((p): p is NonNullable<typeof p> => p !== null)
    : [];

  return (
    <PageHeader
      eyebrow={
        now ? (
          <>
            {greeting(now)}
            {first ? `, ${first}` : ''} · {day}
            {/* A hora só no computador: no telemóvel e no tablet já está no ecrã. */}
            <span className="hidden lg:inline">
              {' · '}
              <time dateTime={now.toISOString()} className="tabular">
                {time}
              </time>
            </span>
          </>
        ) : undefined
      }
      title="Dashboard"
      description={
        !today ? (
          'O que há para fazer hoje e como está o pipeline.'
        ) : parts.length ? (
          <span className="flex flex-wrap gap-x-1.5">
            {parts.map((p, i) => (
              <Fragment key={p.text}>
                {i ? <span aria-hidden>·</span> : null}
                <Link href={p.href} className={cn('hover:text-fg', p.tone === 'danger' && 'text-danger')}>
                  {p.text}
                </Link>
              </Fragment>
            ))}
          </span>
        ) : (
          'Nada marcado para hoje. Bom momento para prospetar.'
        )
      }
      actionsClassName="ml-auto w-full sm:w-auto"
      actions={
        <>
          {organize}
          {/* No telemóvel, os dois botões com a mesma largura: um por linha, a ocupar a largura toda. */}
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">
            {settings?.features.prospecting_session ? (
              <Link href="/prospecao" className={buttonClasses('outline', 'md', 'w-full justify-center sm:w-auto')}>
                <Target className="h-4 w-4" aria-hidden /> Começar prospeção
              </Link>
            ) : null}
            <Link href="/leads/novo" className={buttonClasses('primary', 'md', 'w-full justify-center sm:w-auto')}>
              <Plus className="h-4 w-4" aria-hidden /> Novo lead
            </Link>
          </div>
        </>
      }
    />
  );
}

const PERIODS: { value: DashboardPeriod | 'all'; label: string; compare: string }[] = [
  { value: 'month', label: 'Este mês', compare: 'que no mês passado' },
  { value: '30d', label: '30 dias', compare: 'que nos 30 dias antes' },
  { value: 'all', label: 'Sempre', compare: '' },
];
const PERIOD_KEY = 'vnd.dashboard.period';

const KPIS = ['leads', 'contacto', 'trabalho', 'trabalho2', 'trabalho3'] as const;
type Kpi = (typeof KPIS)[number];
/** Os números do topo do Dashboard: cada pessoa escolhe a ordem e os que quer ver ("dashboard.kpis"). */
export const DASHBOARD_KPI_BOARD: Board<Kpi> = {
  preference: 'dashboard.kpis',
  defaults: KPIS,
  labels: {
    leads: 'Leads (novos ou ativos)',
    contacto: 'Contactados / taxa de conversão',
    trabalho: 'A trabalhar agora',
    trabalho2: 'A trabalhar agora (2.º projeto)',
    trabalho3: 'A trabalhar agora (3.º projeto)',
  },
  alwaysShown: [],
  description: 'A ordem dos números do topo do Dashboard e os que queres ver.',
};

/** Diferença para o período anterior: ↑ +3 (verde), ↓ −2 (vermelho) ou igual. */
function Delta({ now, before, compare, money }: { now: number; before: number; compare: string; money?: boolean }) {
  const diff = now - before;
  const text = money ? euros(Math.abs(diff)) : String(Math.abs(diff));
  if (!diff) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <Minus className="h-3 w-3" aria-hidden /> Igual {compare.replace(/^que /, 'ao que ')}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', diff > 0 ? 'text-success' : 'text-danger')}>
      {diff > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
      {diff > 0 ? '+' : '−'}
      {text} {compare}
    </span>
  );
}

function Tile({ label, value, href, children }: { label: string; value: ReactNode; href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="flex min-w-[10rem] flex-1 flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-muted">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xl font-semibold tabular">{value}</span>
      {children}
    </Link>
  );
}

/**
 * Os projetos em que se está a trabalhar (três cartões: `rank` 0, 1 e 2). A ordem
 * vem de `workingOnPicks`: primeiro o que fixaste em "A trabalhar nisto",
 * depois o do temporizador a contar, depois aquele em que mexeste há menos
 * tempo (48 horas) e, por fim, o de entrega mais próxima.
 */
function WorkingOnTile({ rank }: { rank: 0 | 1 | 2 }) {
  const { data: settings } = useSettings();
  const projectsOn = settings?.features.projects !== false;
  const timeOn = projectsOn && settings?.features.time_tracking !== false;
  const { data: running } = useRunningTimer(timeOn);
  const { data: projects } = useProjects('active', projectsOn);
  const { data: pinned } = usePreference<string>(WORKING_ON_PREFERENCE);
  const elapsed = useElapsed(running?.entry.started_at ?? null);

  const picks = workingOnPicks(projects ?? [], {
    pinned: typeof pinned === 'string' ? pinned : null,
    runningLeadId: running?.lead.id ?? null,
    count: 3,
  });
  const pick = picks[rank];
  const project = pick?.project;
  // Sem projetos na lista (ex.: o temporizador num lead que já não está em curso).
  const lead = project?.lead ?? (rank === 0 ? (running?.lead ?? null) : null);

  if (!projectsOn) return null;
  if (!lead) {
    // Só o primeiro cartão explica que ainda não há projetos; os outros desaparecem.
    if (rank > 0) return null;
    return (
      <Tile label="A trabalhar agora" value={<span className="text-base font-medium text-muted">Nenhum projeto em curso</span>} href="/projetos">
        <span className="text-xs text-muted">Quando um lead passa a Cliente, o projeto aparece aqui.</span>
      </Tile>
    );
  }
  const counting = !!running && running.lead.id === lead.id;
  const total = counting ? (running.logged_seconds ?? 0) + Math.floor(elapsed) : null;
  const task = project?.next_task?.title ?? null;
  const base = rank === 0 ? 'A trabalhar agora' : 'Também em curso';
  return (
    <Tile
      label={counting ? `${base} · a contar` : pick?.reason === 'fixado' ? `${base} · fixado por ti` : base}
      value={<span className="block truncate text-base font-semibold">{projectLabel(lead)}</span>}
      href={`${leadPath(lead)}#projeto`}
    >
      {counting ? (
        <span className="inline-flex items-center gap-1 text-xs text-accent-text tabular">
          <Timer className="h-3 w-3" aria-hidden /> {formatClock(total ?? 0)}
        </span>
      ) : project ? (
        <span className="text-xs text-muted">
          {PROJECT_STAGE_LABELS[project.info.stage]}
          {project.info.due_on ? ` · entrega ${formatDate(project.info.due_on)}` : ''}
        </span>
      ) : null}
      {task ? <span className="block truncate text-xs text-muted">Próximo: {task}</span> : null}
    </Tile>
  );
}

/** Os números do topo: este mês (por omissão), 30 dias ou sempre. */
export function SummaryStrip({ totals }: { totals: Dashboard['totals'] }) {
  const [period, setPeriod] = useState<DashboardPeriod | 'all'>('month');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERIOD_KEY) as DashboardPeriod | 'all' | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- só depois de montar (localStorage)
      if (saved && PERIODS.some((p) => p.value === saved)) setPeriod(saved);
    } catch {
      // sem localStorage: fica "Este mês"
    }
  }, []);
  function choose(p: DashboardPeriod | 'all') {
    setPeriod(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      // ignora
    }
  }
  const { data } = useDashboardPeriod(period === 'all' ? null : period);
  const compare = PERIODS.find((p) => p.value === period)!.compare;
  const layout = useCardLayout(DASHBOARD_KPI_BOARD.preference);
  const keys = visibleCards(DASHBOARD_KPI_BOARD, layout, () => true);
  const t = totals;
  const c = data?.current;
  const b = data?.previous;

  const tiles: Record<Kpi, ReactNode> =
    period === 'all'
      ? {
          leads: <Tile label="Leads ativos" value={t.active} href="/leads">{<span className="text-xs text-muted">{t.paused ? `${t.paused} em pausa` : `${t.total} no total`}</span>}</Tile>,
          contacto: (
            <Tile label="Taxa de conversão" value={formatPercent(t.conversion_rate_contacted)} href="/estatisticas">
              <span className="text-xs text-muted">dos leads contactados</span>
            </Tile>
          ),
          trabalho: <WorkingOnTile rank={0} />,
          trabalho2: <WorkingOnTile rank={1} />,
          trabalho3: <WorkingOnTile rank={2} />,
        }
      : {
          leads: <Tile label="Leads novos" value={c ? c.new_leads : '—'} href="/leads">{c && b ? <Delta now={c.new_leads} before={b.new_leads} compare={compare} /> : null}</Tile>,
          contacto: <Tile label="Contactados" value={c ? c.contacted : '—'} href="/leads?status=contactado">{c && b ? <Delta now={c.contacted} before={b.contacted} compare={compare} /> : null}</Tile>,
          trabalho: <WorkingOnTile rank={0} />,
          trabalho2: <WorkingOnTile rank={1} />,
          trabalho3: <WorkingOnTile rank={2} />,
        };

  return (
    <section aria-label="Resumo" className="mb-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* No telemóvel ocupa a largura toda (três partes iguais). */}
        <div role="group" aria-label="Período dos números" className="flex h-9 w-full items-center rounded-lg border border-border-input bg-surface-2 p-0.5 sm:inline-flex sm:w-auto">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => choose(p.value)}
              className={cn('inline-flex h-full flex-1 items-center justify-center rounded-md px-3 text-sm sm:flex-none', period === p.value ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <CardLayoutButton board={DASHBOARD_KPI_BOARD} available={KPIS} label="Organizar números" className="ml-auto" />
      </div>
      {keys.length ? (
        <div className="flex flex-wrap items-stretch gap-3">
          {keys.map((k) => (
            <Fragment key={k}>{tiles[k]}</Fragment>
          ))}
        </div>
      ) : null}
    </section>
  );
}
