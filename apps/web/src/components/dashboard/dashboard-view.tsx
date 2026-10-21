'use client';

import {
  LEAD_STATUS_META,
  formatCurrency,
  formatDate,
  formatPercent,
  type Lead,
  type LeadStatus,
  type TodayMeeting,
  type TodayTask,
  leadPath,
} from '@vndesign/core';
import { AlertCircle, BarChart3, BriefcaseBusiness, CalendarClock, CalendarDays, Flame, ListChecks, MapPin, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { StatTile } from '@/components/charts/stat-tile';
import { FollowUpEmailButton } from '@/components/email/send-email-dialog';
import { FollowUpActions } from '@/components/follow-up/follow-up-actions';
import { StatusBadge } from '@/components/leads/badges';
import { LeadScoreBadge } from '@/components/leads/lead-score';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { DueChip, ReminderChip } from '@/components/tasks/tasks-card';
import { Linkified } from '@/lib/linkify';
import { useBilling, useDashboard, useSettings, useToday } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { meetingLabel } from '@/components/meetings/meetings-card';
import { StatusIcon } from '@/components/icons/lead-icons';

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
            <Link href={leadPath(l)} className="min-w-0 flex-1 rounded-md px-2 py-2 hover:bg-surface-2">
              <span className="block truncate text-sm font-medium">
                <span className="text-muted tabular">#{l.number}</span> {l.company_name}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className={`tabular ${tone === 'danger' ? 'font-semibold text-danger' : ''}`}>{formatDate(l.next_action_on)}</span>
                <span className="min-w-0 truncate">{l.next_action_text ?? 'Próxima ação'}</span>
                <StatusBadge status={l.status} />
              </span>
            </Link>
            <FollowUpEmailButton lead={l} compact />
            <FollowUpActions lead={l} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Reuniões de hoje e dos próximos 7 dias. */
function TodayMeetings({ meetings }: { meetings: TodayMeeting[] }) {
  if (!meetings.length) return null;
  return (
    <section aria-label="Reuniões">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4" aria-hidden />
        Reuniões <span className="font-normal text-muted">({meetings.length})</span>
      </h3>
      <ul className="divide-y divide-border">
        {meetings.map((m) => (
          <li key={m.id}>
            <Link href={leadPath(m.lead)} className="block rounded-md px-2 py-2 hover:bg-surface-2">
              <span className="block truncate text-sm font-medium">
                <span className="text-muted tabular">#{m.lead.number}</span> {m.lead.company_name}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="tabular">{meetingLabel(m.starts_at)}</span>
                {m.location ? (
                  <span className="inline-flex min-w-0 items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {m.location}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Faturação (com os pagamentos ligados): recebido este mês, por receber e em atraso. */
function BillingCard() {
  const { data: settings } = useSettings();
  const enabled = settings?.features.payments ?? false;
  const { data } = useBilling(enabled);
  if (!enabled || !data || (!data.received_month && !data.outstanding && !data.active_projects)) return null;
  return (
    <Card>
      <CardHeader
        title="Faturação"
        description="Pagamentos dos clientes"
        actions={
          <Link href="/projetos" className="text-sm text-accent-text hover:underline">
            Projetos
          </Link>
        }
      />
      <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
        <div>
          <dt className="text-muted">Recebido este mês</dt>
          <dd className="text-lg font-semibold tabular">{euros(data.received_month)}</dd>
        </div>
        <div>
          <dt className="text-muted">Por receber</dt>
          <dd className="text-lg font-semibold tabular">{euros(data.outstanding)}</dd>
        </div>
        <div>
          <dt className="text-muted">Em atraso</dt>
          <dd className={`text-lg font-semibold tabular ${data.overdue ? 'text-danger' : ''}`}>{euros(data.overdue)}</dd>
        </div>
        <div>
          <dt className="text-muted">Projetos em curso</dt>
          <dd className="inline-flex items-center gap-1.5 text-lg font-semibold tabular">
            <BriefcaseBusiness className="h-4 w-4 text-muted" aria-hidden />
            {data.active_projects}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/** Tarefas com prazo (em atraso, hoje e próximos 7 dias): marcar como feita aqui mesmo. */
function TodayTasks({ title, today, tasks }: { title: string; today: string; tasks: TodayTask[] }) {
  const qc = useQueryClient();
  const [doneIds, setDoneIds] = useState<string[]>([]);
  if (!tasks.length) return null;
  const overdue = tasks.filter((t) => t.due_on! < today).length;
  async function complete(task: TodayTask) {
    setDoneIds((ids) => [...ids, task.id]);
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: true } });
      toast.success(`Tarefa concluída: ${task.title}`);
    } catch (error) {
      setDoneIds((ids) => ids.filter((id) => id !== task.id));
      toast.error(errorMessage(error));
    } finally {
      void qc.invalidateQueries({ queryKey: ['today'] });
      void qc.invalidateQueries({ queryKey: ['tasks', task.lead.id] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    }
  }
  return (
    <section aria-label={title}>
      <h3 className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${overdue ? 'text-danger' : ''}`}>
        <ListChecks className="h-4 w-4" aria-hidden />
        {title} <span className="font-normal text-muted">({tasks.length}{overdue ? `, ${overdue} em atraso` : ''})</span>
      </h3>
      <ul className="divide-y divide-border">
        {tasks.map((t) => {
          const done = doneIds.includes(t.id);
          return (
            <li key={t.id} className="flex items-start gap-2 px-2 py-2">
              <input
                type="checkbox"
                checked={done}
                disabled={done}
                onChange={() => void complete(t)}
                aria-label={`Concluir: ${t.title}`}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
              />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium break-words ${done ? 'text-muted line-through' : ''}`}><Linkified text={t.title} /></span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <DueChip due={t.due_on} today={today} done={done} />
                  <ReminderChip task={t} />
                  <Link href={`${leadPath(t.lead)}#tarefas`} className="hover:text-fg hover:underline">
                    <span className="tabular">#{t.lead.number}</span> {t.lead.company_name}
                  </Link>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TodayCard({ className }: { className?: string }) {
  const { data, isLoading } = useToday();
  // Tarefas em atraso e de hoje logo a seguir aos follow-ups de hoje; as da semana no fim.
  const urgentTasks = data?.tasks ? [...data.tasks.overdue, ...data.tasks.due_today] : [];
  const weekTasks = data?.tasks?.upcoming ?? [];
  const empty =
    data &&
    !data.overdue.length &&
    !data.due_today.length &&
    !data.upcoming.length &&
    !urgentTasks.length &&
    !weekTasks.length &&
    !data.meetings?.length;
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title="Hoje" description={data ? `Follow-ups, próximas ações e tarefas · ${formatDate(data.today)}` : undefined} />
      {/* Telemóvel: altura limitada; computador: ocupa a altura da coluna da direita (com scroll). */}
      <div className="flex max-h-[26rem] flex-col gap-4 overflow-y-auto p-3 lg:max-h-none lg:min-h-0 lg:flex-1">
        {isLoading ? <Skeleton className="h-40" /> : null}
        {empty ? <p className="px-2 py-6 text-center text-sm text-muted">Nada agendado para os próximos 7 dias. 🎉</p> : null}
        {data ? (
          <>
            <TodayMeetings meetings={data.meetings ?? []} />
            <TodayGroup title="Em atraso" tone="danger" icon={<AlertCircle className="h-4 w-4" aria-hidden />} leads={data.overdue} />
            <TodayGroup title="Para hoje" icon={<CalendarClock className="h-4 w-4" aria-hidden />} leads={data.due_today} />
            <TodayTasks title="Tarefas para hoje" today={data.today} tasks={urgentTasks} />
            <TodayGroup title="Próximos 7 dias" icon={<CalendarDays className="h-4 w-4" aria-hidden />} leads={data.upcoming} />
            <TodayTasks title="Tarefas nos próximos 7 dias" today={data.today} tasks={weekTasks} />
          </>
        ) : null}
      </div>
    </Card>
  );
}

/** Os leads com maior prioridade (pontuação calculada pela base de dados). */
function HotLeadsCard() {
  const { data } = useToday();
  const hot = data?.hot ?? [];
  if (!hot.length) return null;
  return (
    <Card>
      <CardHeader
        title="Leads mais quentes"
        description="Quem vale mais a pena contactar agora"
        actions={
          <Link href="/leads?sort=score&order=desc" className="text-sm text-accent-text hover:underline">
            Ver todos
          </Link>
        }
      />
      <ul className="flex flex-col p-2" aria-label="Leads mais quentes">
        {hot.map((l) => (
          <li key={l.id}>
            <Link
              href={leadPath(l)}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
              title={l.score_reasons?.join(' · ')}
            >
              <Flame className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.company_name}</span>
                <span className="block truncate text-xs text-muted">
                  {l.score_reasons?.slice(0, 2).join(' · ') || LEAD_STATUS_META[l.status].label}
                </span>
              </span>
              <LeadScoreBadge lead={l} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Estados pela ordem do pipeline, com o número de leads e ligação à lista filtrada. */
function PipelineCard({ byStatus }: { byStatus: { status: LeadStatus; count: number }[] }) {
  const max = Math.max(1, ...byStatus.map((s) => s.count));
  return (
    <Card>
      <CardHeader
        title="Pipeline"
        description="Leads em cada estado"
        actions={
          <Link href="/kanban" className="text-sm text-accent-text hover:underline">
            Kanban
          </Link>
        }
      />
      <ul className="flex flex-col p-2" aria-label="Leads por estado">
        {byStatus.map(({ status, count }) => (
          <li key={status}>
            <Link
              href={`/leads?status=${status}`}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
            >
              <StatusIcon status={status} className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{LEAD_STATUS_META[status].label}</span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(count / max) * 100}%` }} />
              </span>
              <span className="w-8 text-right font-medium tabular">{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Dashboard: o que há para fazer hoje e quatro números essenciais (o resto em Estatísticas). */
export function DashboardView() {
  const { data, isLoading, error } = useDashboard();

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
        {Array.from({ length: 4 }, (_, i) => (
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

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Leads ativos" value={t.active} hint={t.paused ? `${t.paused} em pausa` : `${t.total} no total`} />
        <StatTile label="Clientes ganhos" value={t.won} hint={t.value_won ? `${euros(t.value_won)} ganhos` : undefined} />
        <StatTile label="Taxa de conversão" value={formatPercent(t.conversion_rate_contacted)} hint="dos leads contactados" />
        <StatTile label="Valor do pipeline" value={euros(t.value_pipeline)} hint="Soma dos leads ativos" />
      </section>

      {/* No telemóvel os cartões ficam numa só coluna ("contents") e o "Hoje" passa para o topo: é o que se abre o dia a ver. */}
      <div className="contents lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:gap-5">
        {/* No computador, o "Hoje" estica até ao fundo da coluna da direita (sem espaço vazio por baixo). */}
        <div className="max-lg:order-first lg:relative lg:min-h-[26rem]">
          <TodayCard className="lg:absolute lg:inset-0" />
        </div>
        <div className="flex flex-col gap-5">
          <HotLeadsCard />
          <BillingCard />
          <PipelineCard byStatus={data.by_status} />
          <Link
            href="/estatisticas"
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-accent-text" aria-hidden />
              Ver todas as estatísticas
            </span>
            <span className="text-muted" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
