'use client';

import {
  projectMatches,
  LEAD_STATUS_META,
  formatCurrency,
  formatDate,
  formatDateTime,
  todayIso,
  type TodayOpenedEmail,
  type Lead,
  type LeadStatus,
  type TodayMeeting,
  type TodayTask,
  leadPath,
  reschedulePlan,
  DASHBOARD_CARDS,
  DASHBOARD_CARDS_PREFERENCE,
  type DashboardCard,
} from '@vndesign/core';
import { AlertCircle, BarChart3, BellRing, BriefcaseBusiness, CalendarClock, CalendarDays, Eye, Flame, ListChecks, MapPin, Phone, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { Fragment, useState, type ReactNode } from 'react';
import { FollowUpEmailButton } from '@/components/email/send-email-dialog';
import { FollowUpActions } from '@/components/follow-up/follow-up-actions';
import { StatusBadge } from '@/components/leads/badges';
import { LeadScoreBadge } from '@/components/leads/lead-score';
import { buttonClasses } from '@/components/ui/button';
import { DateMenu } from '@/components/ui/date-menu';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { DueChip, ReminderChip } from '@/components/tasks/tasks-card';
import { Linkified } from '@/lib/linkify';
import { useBilling, useDashboard, useProjects, useReschedule, useRole, useSettings, useToday } from '@/lib/queries';
import { MyTeamTiles } from './team-stats';
import { DashboardHeader, SummaryStrip } from './dashboard-top';
import { ReconnectCard } from './reconnect-card';
import { RepliesCard } from './replies-card';
import { CardLayoutButton, DASHBOARD_BOARD, useCardLayout, visibleCards } from '@/components/leads/card-layout';
import { cn } from '@/lib/utils';
import { DueBadge, ProgressBar, StageLabel } from '@/components/projects/project-bits';
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

const lisbonDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(iso));

/** Reuniões: as de hoje e, à parte, as dos próximos 7 dias. */
function TodayMeetings({ meetings, today }: { meetings: TodayMeeting[]; today: string }) {
  if (!meetings.length) return null;
  const todays = meetings.filter((m) => lisbonDay(m.starts_at) === today);
  const later = meetings.filter((m) => lisbonDay(m.starts_at) !== today);
  return (
    <>
      <MeetingList title="Reuniões de hoje" meetings={todays} />
      <MeetingList title="Reuniões nos próximos 7 dias" meetings={later} />
    </>
  );
}

function MeetingList({ title, meetings }: { title: string; meetings: TodayMeeting[] }) {
  if (!meetings.length) return null;
  return (
    <section aria-label={title}>
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4" aria-hidden />
        {title} <span className="font-normal text-muted">({meetings.length})</span>
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

function ProjectsCard({ className }: { className?: string }) {
  const { data: settings } = useSettings();
  const enabled = settings?.features.projects ?? false;
  const { data: projects, isLoading } = useProjects('active', enabled);
  const { data: billing } = useBilling(enabled && !!settings?.features.payments);
  const [today] = useState(() => todayIso());
  if (!enabled) return null;
  // Os que precisam de atenção (entrega atrasada ou pagamento em atraso) primeiro.
  const late = (projects ?? []).filter((p) => projectMatches(p, 'atrasados', today));
  const owing = (projects ?? []).filter((p) => projectMatches(p, 'pagamentos', today));
  const attention = new Set([...late, ...owing].map((p) => p.lead.id));
  const list = [...(projects ?? [])].sort((a, b) => Number(attention.has(b.lead.id)) - Number(attention.has(a.lead.id)));
  // Uma só linha (alinhada com o cabeçalho do Pipeline): o atraso, se houver; senão, o que falta receber.
  const money = billing?.overdue ? (
    <span className="text-danger"> · {euros(billing.overdue)} em atraso</span>
  ) : billing?.outstanding ? (
    ` · ${euros(billing.outstanding)} por receber`
  ) : null;
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Projetos"
        description={
          isLoading ? (
            'Clientes com o projeto em curso'
          ) : (
            <>
              {list.length} em curso{money}
            </>
          )
        }
        actions={
          <Link href="/projetos" className="text-sm text-accent-text hover:underline">
            Ver todos
          </Link>
        }
      />
      {late.length || owing.length ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-xs font-medium" role="status" aria-label="Projetos a precisar de atenção">
          <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden />
          {late.length ? (
            <Link href="/projetos?filtro=atrasados" className="text-danger hover:underline">
              {late.length} com a entrega atrasada
            </Link>
          ) : null}
          {owing.length && settings?.features.payments ? (
            <Link href="/projetos?filtro=pagamentos" className="text-danger hover:underline">
              {owing.length} com pagamentos em atraso
            </Link>
          ) : null}
        </p>
      ) : null}
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-24" />
        </div>
      ) : list.length ? (
        <ul className="flex flex-col p-2" aria-label="Projetos em curso">
          {list.slice(0, 3).map(({ lead, info, tasks }) => (
            <li key={lead.id}>
              <Link href={`${leadPath(lead)}#projeto`} className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                <span className="flex min-w-0 items-center gap-2">
                  <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{lead.company_name} {lead.project_title ? <span className="font-normal text-muted">· {lead.project_title}</span> : null}</span>
                  <DueBadge dueOn={info.due_on} today={today} className="shrink-0" />
                </span>
                <span className="flex items-center gap-3 pl-5.5 text-xs text-muted">
                  <StageLabel stage={info.stage} />
                  {tasks.total ? (
                    <ProgressBar className="min-w-0 flex-1" value={tasks.done} total={tasks.total} label={`Tarefas de ${lead.company_name}: ${tasks.done} de ${tasks.total}`} />
                  ) : (
                    <span>Sem tarefas</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
          {list.length > 3 ? (
            <li className="px-2 pt-1 text-xs text-muted">
              <Link href="/projetos" className="hover:text-fg hover:underline">
                + {list.length - 3} projeto{list.length - 3 === 1 ? '' : 's'}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted">
          Sem projetos em curso. Quando um lead passa a “Cliente”, aparece aqui.
        </p>
      )}
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
      toast.success(`Tarefa concluída: ${task.title}`, {
        action: {
          label: 'Anular',
          onClick: () => {
            setDoneIds((ids) => ids.filter((id) => id !== task.id));
            api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: false } })
              .catch((error: unknown) => toast.error(errorMessage(error)))
              .finally(() => {
                void qc.invalidateQueries({ queryKey: ['today'] });
                void qc.invalidateQueries({ queryKey: ['tasks', task.lead.id] });
              });
          },
        },
      });
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

/** Leads que abriram um email nas últimas 48 horas: bom momento para ligar. */
function TodayOpened({ items }: { items: TodayOpenedEmail[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Abriram o teu email">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Eye className="h-4 w-4" aria-hidden />
        Abriram o teu email <span className="font-normal text-muted">({items.length})</span>
      </h3>
      <ul className="divide-y divide-border">
        {items.map((o) => (
          <li key={o.id} className="flex items-center gap-1">
            <Link href={leadPath(o.lead)} className="min-w-0 flex-1 rounded-md px-2 py-2 hover:bg-surface-2">
              <span className="block truncate text-sm font-medium">
                <span className="text-muted tabular">#{o.lead.number}</span> {o.lead.company_name}
              </span>
              <span className="mt-1 block truncate text-xs text-muted">
                {o.clicks ? 'Carregou num link' : `Abriu ${o.opens}×`} · {formatDateTime(o.last_opened_at)} · “{o.subject}”
              </span>
            </Link>
            {o.lead.phone ? (
              <a
                href={`tel:${o.lead.phone.replace(/[^\d+]/g, '')}`}
                className={buttonClasses('ghost', 'sm')}
                aria-label={`Ligar a ${o.lead.company_name}`}
                title="Ligar"
              >
                <Phone className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Mudar a data de vários de uma vez, com "Anular" (volta cada um à data que
 * tinha): "Pôr em dia" os atrasados e "Marcar follow-up" nos que estão em
 * conversa sem próximo passo.
 */
function useBulkDate(today: string) {
  const reschedule = useReschedule();
  return async (leads: Lead[], tasks: TodayTask[], date: string | null) => {
    if (!date) return;
    const plan = reschedulePlan(leads, tasks, date);
    try {
      const r = await reschedule.mutateAsync(plan.apply);
      const parts = [
        r.leads ? `${r.leads} follow-up${r.leads === 1 ? '' : 's'}` : '',
        r.tasks ? `${r.tasks} tarefa${r.tasks === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      toast.success(`${parts.join(' e ')} ${r.leads + r.tasks === 1 ? 'passou' : 'passaram'} para ${date === today ? 'hoje' : formatDate(date)}.`, {
        action: {
          label: 'Anular',
          // mutateAsync: o aviso pode ficar depois de este bloco desaparecer.
          onClick: () =>
            reschedule.mutateAsync(plan.undo).then(
              () => toast.success('Datas repostas.'),
              (e: unknown) => toast.error(errorMessage(e)),
            ),
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
}

/** "Pôr em dia": passa os follow-ups e as tarefas em atraso para hoje, amanhã, a próxima semana ou outra data. */
function TodayCatchUp({ today, leads, tasks }: { today: string; leads: Lead[]; tasks: TodayTask[] }) {
  const move = useBulkDate(today);
  if (!leads.length && !tasks.length) return null;
  const what = [
    leads.length ? `${leads.length} follow-up${leads.length === 1 ? '' : 's'}` : '',
    tasks.length ? `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return (
    <div role="status" aria-label="Atrasados" className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm">
      <span className="mr-auto">
        <span className="font-medium text-danger">Em atraso:</span> {what.join(' e ')}
      </span>
      <DateMenu
        today={today}
        heading="Passar os atrasados para"
        triggerClassName={buttonClasses('outline', 'sm')}
        label={
          <>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Pôr em dia
          </>
        }
        onPick={(d) => void move(leads, tasks, d)}
      />
    </div>
  );
}

/** Leads em conversa (contactado, respondeu, reunião, proposta) sem próximo passo marcado: estão a ser esquecidos. */
function TodayStalled({ today, leads }: { today: string; leads: Lead[] }) {
  const move = useBulkDate(today);
  if (!leads.length) return null;
  return (
    <div role="status" aria-label="Sem próximo passo" className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/50 px-3 py-2 text-sm">
      <span className="mr-auto">
        <Link href="/leads?due=none" className="font-medium text-warning hover:underline">
          {leads.length === 1 ? '1 lead em conversa' : `${leads.length} leads em conversa`} sem próximo passo
        </Link>
      </span>
      <DateMenu
        today={today}
        heading="Marcar o follow-up para"
        triggerClassName={buttonClasses('outline', 'sm')}
        label={
          <>
            <BellRing className="h-3.5 w-3.5" aria-hidden /> Marcar follow-up
          </>
        }
        onPick={(d) => void move(leads, [], d)}
      />
    </div>
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
    !data.meetings?.length &&
    !data.opened?.length &&
    !data.stalled?.length;
  return (
    <Card id="hoje" className={cn('flex scroll-mt-20 flex-col', className)}>
      <CardHeader
        title="Hoje"
        description={data ? `Follow-ups, próximas ações e tarefas · ${formatDate(data.today)}` : undefined}
      />
      <div className="relative flex max-h-[26rem] flex-col gap-4 overflow-y-auto p-3">
        {isLoading ? <Skeleton className="h-40" /> : null}
        {empty ? <p className="px-2 py-6 text-center text-sm text-muted">Nada agendado para os próximos 7 dias. 🎉</p> : null}
        {data ? (
          <>
            <TodayMeetings meetings={data.meetings ?? []} today={data.today} />
            <TodayOpened items={data.opened ?? []} />
            <TodayCatchUp today={data.today} leads={data.overdue} tasks={data.tasks?.overdue ?? []} />
            <TodayStalled today={data.today} leads={data.stalled ?? []} />
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
function HotLeadsCard({ className }: { className?: string }) {
  const { data } = useToday();
  const hot = data?.hot ?? [];
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Leads mais quentes"
        description="Quem vale mais a pena contactar agora"
        actions={
          <Link href="/leads?sort=score&order=desc" className="text-sm text-accent-text hover:underline">
            Ver todos
          </Link>
        }
      />
      {data && !hot.length ? (
        <p className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted">Sem leads quentes de momento.</p>
      ) : null}
      <ul className="flex flex-col p-2 empty:hidden" aria-label="Leads mais quentes">
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
function PipelineCard({ byStatus, className }: { byStatus: { status: LeadStatus; count: number }[]; className?: string }) {
  const max = Math.max(1, ...byStatus.map((s) => s.count));
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Pipeline"
        description="Leads em cada estado"
        actions={
          <span className="flex items-center gap-3 text-sm">
            <Link href="/kanban" className="text-accent-text hover:underline">
              Kanban
            </Link>
            <Link href="/estatisticas" className="inline-flex items-center gap-1 text-accent-text hover:underline">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Estatísticas
            </Link>
          </span>
        }
      />
      {/* No computador, em duas colunas (por baixo do "Hoje", que é largo). */}
      {/* Ocupa a altura toda do cartão (fica alinhado com o cartão Projetos ao lado). */}
      <ul className="grid flex-1 p-2 lg:grid-flow-col lg:grid-rows-4 lg:content-evenly lg:gap-x-6" aria-label="Leads por estado">
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
  const role = useRole();
  if (role === null) return <Skeleton className="h-24" />;
  return role === 'prospector' ? <ProspectorDashboard /> : <OwnerDashboard />;
}

/** Equipa de prospeção: os números dele, o "Hoje" e os leads mais quentes (só os seus). */
function ProspectorDashboard() {
  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader />
      <MyTeamTiles />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <TodayCard />
        <HotLeadsCard />
      </div>
      <RepliesCard />
    </div>
  );
}

function OwnerDashboard() {
  const { data, isLoading, error } = useDashboard();
  const { data: settings } = useSettings();
  const projectsOn = settings?.features.projects ?? false;
  const layout = useCardLayout(DASHBOARD_CARDS_PREFERENCE);
  const available = DASHBOARD_CARDS.filter((k) => projectsOn || (k !== 'projects' && k !== 'reconnect'));
  // "Organizar cartões" no topo (antes estava no fundo da página).
  const header = <DashboardHeader organize={<CardLayoutButton board={DASHBOARD_BOARD} available={available} className="self-center" />} />;

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
  if (isLoading || !data) {
    return (
      <>
        {header}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </>
    );
  }

  const t = data.totals;
  if (t.total === 0) {
    return (
      <>
        {header}
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
      </>
    );
  }

  const summary = <SummaryStrip totals={t} />;

  // Sem nada mudado: as duas filas alinhadas de sempre (cartões da mesma fila com a mesma altura):
  // Hoje | Leads mais quentes e Pipeline | Projetos. Telemóvel: uma coluna, com o "Hoje" no topo e o Pipeline no fim.
  if (!layout || (!layout.order.length && !layout.hidden.length)) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {summary}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <TodayCard className="lg:col-start-1 lg:row-start-1" />
          <HotLeadsCard className="lg:col-start-2 lg:row-start-1" />
          <RepliesCard className="lg:col-span-2 lg:row-start-2" />
          <PipelineCard
            byStatus={data.by_status}
            className={cn('max-lg:order-last lg:col-start-1 lg:row-start-3', !projectsOn && 'lg:col-span-2')}
          />
          <ProjectsCard className="lg:col-start-2 lg:row-start-3" />
        </div>
        {projectsOn ? <ReconnectCard /> : null}
      </div>
    );
  }

  // Organizado à medida: pela ordem escolhida (o Resumo e os Clientes antigos a toda a largura; os outros em duas colunas).
  const cards: Record<DashboardCard, ReactNode> = {
    summary,
    today: <TodayCard />,
    hot: <HotLeadsCard />,
    replies: <RepliesCard />,
    pipeline: <PipelineCard byStatus={data.by_status} />,
    projects: <ProjectsCard />,
    reconnect: <ReconnectCard />,
  };
  const wide = new Set<DashboardCard>(['summary', 'replies', 'reconnect']);
  const blocks: DashboardCard[][] = [];
  for (const key of visibleCards(DASHBOARD_BOARD, layout, (k) => available.includes(k))) {
    const last = blocks[blocks.length - 1];
    if (wide.has(key) || !last || wide.has(last[0]!)) blocks.push([key]);
    else last.push(key);
  }
  return (
    <div className="flex flex-col gap-5">
      {header}
      {blocks.map((block) =>
        wide.has(block[0]!) ? (
          <Fragment key={block[0]}>{cards[block[0]!]}</Fragment>
        ) : (
          <div key={block.join('-')} className="flex flex-col gap-5 lg:grid lg:grid-flow-dense lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            {block.map((key) => (
              <Fragment key={key}>{cards[key]}</Fragment>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
