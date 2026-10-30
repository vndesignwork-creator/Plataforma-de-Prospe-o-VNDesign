'use client';

import {
  projectMatches,
  LEAD_STATUS_META,
  formatCurrency,
  formatDate,
  formatDateTime,
  relativeDay,
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
import { AlertCircle, BarChart3, BellRing, BriefcaseBusiness, CalendarClock, CalendarDays, Eye, ListChecks, Mail, MapPin, Phone, Users } from 'lucide-react';
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
import { cn, telUrl } from '@/lib/utils';
import { DueBadge, StageLabel } from '@/components/projects/project-bits';
import { meetingLabel } from '@/components/meetings/meetings-card';
import { StatusIcon } from '@/components/icons/lead-icons';

const euros = (v: number) => formatCurrency(v, { decimals: false });

/** Quantos aparecem em cada grupo do "Hoje" antes de "Mostrar todos" (sem lista com scroll dentro do cartão). */
const SHOWN = 5;

/** "Mostrar todos (21)" / "Mostrar menos" por baixo de um grupo comprido. */
function ShowAll({ total, open, onToggle, what }: { total: number; open: boolean; onToggle: () => void; what: string }) {
  if (total <= SHOWN) return null;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="mt-1 px-2 py-1 text-xs font-medium text-accent-text hover:underline">
      {open ? 'Mostrar menos' : `Mostrar todos (${total})`}
      <span className="sr-only"> — {what}</span>
    </button>
  );
}

/**
 * Follow-ups de um grupo do "Hoje". O que é igual em todas as linhas (ex.: "Primeiro contacto ·
 * Identificado") aparece uma vez por cima, e cada linha fica só com o que muda.
 */
function TodayGroup({
  title,
  icon,
  leads,
  today,
  when,
  header,
}: {
  title: string;
  icon?: ReactNode;
  leads: Lead[];
  today: string;
  when: 'past' | 'today' | 'future';
  /** Em vez do título (o "Em atraso" usa a faixa com "Pôr em dia"). */
  header?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  if (!leads.length) return null;
  const firstText = leads[0]!.next_action_text ?? '';
  const sameText = leads.length > 1 && leads.every((l) => (l.next_action_text ?? '') === firstText);
  const sameStatus = leads.length > 1 && leads.every((l) => l.status === leads[0]!.status);
  const common = [sameText ? firstText : '', sameStatus ? LEAD_STATUS_META[leads[0]!.status].label : ''].filter(Boolean);
  return (
    <section aria-label={title}>
      {header ?? (
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {title} <span className="font-normal text-muted">({leads.length})</span>
        </h3>
      )}
      {common.length ? <p className="mt-1.5 px-2 text-xs text-muted">Todos: {common.join(' · ')}</p> : null}
      <ul className="divide-y divide-border" aria-label={title}>
        {(all ? leads : leads.slice(0, SHOWN)).map((l) => {
          const details = [
            when !== 'today' && l.next_action_on ? (
              <span key="d" className="tabular" title={formatDate(l.next_action_on)}>
                {relativeDay(l.next_action_on, today)}
              </span>
            ) : null,
            sameText ? null : (
              <span key="t" className="min-w-0 truncate">
                {l.next_action_text ?? 'Próxima ação'}
              </span>
            ),
            sameStatus ? null : <StatusBadge key="s" status={l.status} />,
          ].filter(Boolean);
          return (
            // Sem espaço (telemóvel), os botões passam para baixo do nome, encostados à direita.
            <li key={l.id} className="flex flex-wrap items-center gap-x-1">
              <Link href={leadPath(l)} className="min-w-[12rem] flex-1 rounded-md px-2 py-2 hover:bg-surface-2">
                <span className="block truncate text-sm font-medium">
                  <span className="text-muted tabular">#{l.number}</span> {l.company_name}
                </span>
                {details.length ? <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{details}</span> : null}
              </Link>
              <span className="ml-auto flex items-center gap-1 pb-1 sm:pb-0">
                <FollowUpEmailButton lead={l} compact />
                <FollowUpActions lead={l} compact />
              </span>
            </li>
          );
        })}
      </ul>
      <ShowAll total={leads.length} open={all} onToggle={() => setAll(!all)} what={title} />
    </section>
  );
}

const lisbonDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(iso));

function MeetingList({ title, meetings }: { title: string; meetings: TodayMeeting[] }) {
  const [all, setAll] = useState(false);
  if (!meetings.length) return null;
  return (
    <section aria-label={title}>
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4" aria-hidden />
        {title} <span className="font-normal text-muted">({meetings.length})</span>
      </h3>
      <ul className="divide-y divide-border">
        {(all ? meetings : meetings.slice(0, SHOWN)).map((m) => (
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
      <ShowAll total={meetings.length} open={all} onToggle={() => setAll(!all)} what={title} />
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
        className="py-2.5"
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
          {list.slice(0, 3).map(({ lead, info, tasks, next_task }) => (
            <li key={lead.id}>
              <Link href={`${leadPath(lead)}#projeto`} className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                <span className="flex min-w-0 items-center gap-2">
                  <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{lead.company_name} {lead.project_title ? <span className="font-normal text-muted">· {lead.project_title}</span> : null}</span>
                  <DueBadge dueOn={info.due_on} today={today} className="shrink-0" />
                </span>
                {/* O próximo passo (a próxima tarefa) em vez de uma barra a 0 % que parecia um erro. */}
                <span className="flex min-w-0 items-center gap-2 pl-5.5 text-xs text-muted">
                  <span className="shrink-0">
                    <StageLabel stage={info.stage} />
                  </span>
                  <span aria-hidden>·</span>
                  <span className="min-w-0 flex-1 truncate">
                    {next_task ? (
                      <>
                        Próximo: <span className="text-fg">{next_task.title}</span>
                      </>
                    ) : tasks.total ? (
                      'Tarefas todas feitas'
                    ) : (
                      'Sem tarefas'
                    )}
                  </span>
                  {tasks.total ? (
                    <span className="shrink-0 tabular" title={`Tarefas feitas: ${tasks.done} de ${tasks.total}`}>
                      {tasks.done}/{tasks.total}
                    </span>
                  ) : null}
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
  const [all, setAll] = useState(false);
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
        {(all ? tasks : tasks.slice(0, SHOWN)).map((t) => {
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
      <ShowAll total={tasks.length} open={all} onToggle={() => setAll(!all)} what={title} />
    </section>
  );
}

/** Leads que abriram um email nas últimas 48 horas: bom momento para ligar. */
function TodayOpened({ items }: { items: TodayOpenedEmail[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  return (
    <section aria-label="Abriram o teu email">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Eye className="h-4 w-4" aria-hidden />
        Abriram o teu email <span className="font-normal text-muted">({items.length})</span>
      </h3>
      <ul className="divide-y divide-border">
        {(all ? items : items.slice(0, SHOWN)).map((o) => (
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
      <ShowAll total={items.length} open={all} onToggle={() => setAll(!all)} what="Abriram o teu email" />
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
      {/* É também o título da lista dos atrasados (antes havia a faixa e, por baixo, "Em atraso (21)"). */}
      <h3 className="mr-auto flex items-center gap-1.5 font-normal">
        <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden />
        <span>
          <span className="font-semibold text-danger">Em atraso:</span> {what.join(' e ')}
        </span>
      </h3>
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
      {/* A data já está na saudação do topo; sem lista com scroll dentro (cada grupo mostra 5 e "Mostrar todos"). */}
      <CardHeader title="Hoje" description="Follow-ups, próximas ações e tarefas" className="py-2.5" />
      <div className="flex flex-col gap-4 p-3">
        {isLoading ? <Skeleton className="h-40" /> : null}
        {empty ? <p className="px-2 py-6 text-center text-sm text-muted">Nada agendado para os próximos 7 dias. 🎉</p> : null}
        {data ? (
          <>
            {data.overdue.length ? (
              <TodayGroup
                title="Em atraso"
                when="past"
                today={data.today}
                leads={data.overdue}
                header={<TodayCatchUp today={data.today} leads={data.overdue} tasks={data.tasks?.overdue ?? []} />}
              />
            ) : (
              <TodayCatchUp today={data.today} leads={[]} tasks={data.tasks?.overdue ?? []} />
            )}
            <TodayStalled today={data.today} leads={data.stalled ?? []} />
            {/* Pela urgência: atrasados, hoje (reuniões, follow-ups, tarefas), quem abriu o email e só depois a semana. */}
            <MeetingList title="Reuniões de hoje" meetings={(data.meetings ?? []).filter((m) => lisbonDay(m.starts_at) === data.today)} />
            <TodayGroup title="Para hoje" when="today" today={data.today} icon={<CalendarClock className="h-4 w-4" aria-hidden />} leads={data.due_today} />
            <TodayTasks title="Tarefas para hoje" today={data.today} tasks={urgentTasks} />
            <TodayOpened items={data.opened ?? []} />
            <TodayGroup title="Próximos 7 dias" when="future" today={data.today} icon={<CalendarDays className="h-4 w-4" aria-hidden />} leads={data.upcoming} />
            <MeetingList title="Reuniões nos próximos 7 dias" meetings={(data.meetings ?? []).filter((m) => lisbonDay(m.starts_at) !== data.today)} />
            <TodayTasks title="Tarefas nos próximos 7 dias" today={data.today} tasks={weekTasks} />
          </>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Os leads com maior prioridade (pontuação calculada pela base de dados; com a mesma pontuação vêm
 * primeiro os nunca contactados). As razões que todos têm aparecem uma vez em cima; em cada linha, só as outras.
 */
function HotLeadsCard({ className }: { className?: string }) {
  const { data } = useToday();
  const hot = data?.hot ?? [];
  const common = hot.length > 1 ? (hot[0]!.score_reasons ?? []).filter((r) => hot.every((l) => l.score_reasons?.includes(r))) : [];
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Leads mais quentes"
        className="py-2.5"
        description={
          <>
            Quem vale mais a pena contactar agora
            {common.length ? <span className="mt-0.5 block text-xs">Todos: {common.join(' · ')}</span> : null}
          </>
        }
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
        {hot.map((l) => {
          const own = (l.score_reasons ?? []).filter((r) => !common.includes(r));
          const detail = own.slice(0, 2).join(' · ') || [l.city, LEAD_STATUS_META[l.status].label].filter(Boolean).join(' · ');
          return (
            <li key={l.id} className="group flex items-center gap-1 rounded-md hover:bg-surface-2">
              <Link href={leadPath(l)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm" title={l.score_reasons?.join(' · ')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.company_name}</span>
                  <span className="block truncate text-xs text-muted">{detail}</span>
                </span>
                <LeadScoreBadge lead={l} showLabel />
              </Link>
              {/* Ligar / Email: ao passar o rato ou com o teclado (no telemóvel, sempre). */}
              {l.phone || l.email ? (
                <span className="hidden shrink-0 items-center pr-1 group-focus-within:flex group-hover:flex pointer-coarse:flex">
                  {l.phone ? (
                    <a href={telUrl(l.phone)} className={buttonClasses('ghost', 'icon', 'h-8 w-8')} aria-label={`Ligar a ${l.company_name}`} title="Ligar">
                      <Phone className="h-4 w-4" aria-hidden />
                    </a>
                  ) : null}
                  {l.email ? (
                    <Link href={`${leadPath(l)}#contactar`} className={buttonClasses('ghost', 'icon', 'h-8 w-8')} aria-label={`Email a ${l.company_name}`} title="Escrever email">
                      <Mail className="h-4 w-4" aria-hidden />
                    </Link>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** As fases do funil, pela ordem; "Sem interesse" e "Em pausa" ficam à parte, por baixo. */
const FUNNEL: LeadStatus[] = ['identificado', 'contactado', 'respondeu', 'reuniao', 'proposta_enviada', 'cliente'];
const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)} %`;

/**
 * Funil: o nome da fase, logo a seguir o número e a barra, e quantos passaram à fase seguinte
 * (um lead numa fase já passou por todas as anteriores: um cliente conta em todas).
 */
function PipelineCard({ byStatus, className }: { byStatus: { status: LeadStatus; count: number }[]; className?: string }) {
  const count = (s: LeadStatus) => byStatus.find((x) => x.status === s)?.count ?? 0;
  const reached = FUNNEL.map((_, i) => FUNNEL.slice(i).reduce((n, s) => n + count(s), 0));
  const max = Math.max(1, ...FUNNEL.map(count));
  const total = byStatus.reduce((n, s) => n + s.count, 0);
  const aside = (['sem_interesse', 'em_pausa'] as const).filter((s) => count(s));
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Pipeline"
        description="Leads em cada fase e quantos passaram à seguinte"
        className="py-2.5"
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
      <ul className="flex flex-1 flex-col justify-evenly p-2" aria-label="Leads por estado">
        {FUNNEL.map((status, i) => {
          const next = reached[i + 1];
          return (
            <li key={status}>
              <Link
                href={`/leads?status=${status}`}
                className="grid grid-cols-[1rem_minmax(0,9.5rem)_2.25rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2 sm:grid-cols-[1rem_minmax(0,9.5rem)_2.25rem_minmax(0,1fr)_8.5rem]"
              >
                <StatusIcon status={status} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{LEAD_STATUS_META[status].label}</span>
                <span className="text-right font-medium tabular">{count(status)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(count(status) / max) * 100}%` }} />
                </span>
                {/* Telemóvel: a percentagem passa para a linha de baixo. */}
                <span className="col-start-2 col-end-5 text-xs text-muted tabular sm:col-start-auto sm:col-end-auto sm:text-right">
                  {next !== undefined && reached[i] ? `${pct(next, reached[i]!)} avançaram` : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted">
        {total ? (
          <span>
            <span className="font-medium text-fg tabular">{pct(count('cliente'), total)}</span> dos leads passaram a cliente
          </span>
        ) : null}
        {aside.map((s) => (
          <Link key={s} href={`/leads?status=${s}`} className="inline-flex items-center gap-1 hover:text-fg hover:underline">
            <StatusIcon status={s} className="h-3 w-3" />
            {LEAD_STATUS_META[s].label}: <span className="tabular">{count(s)}</span>
          </Link>
        ))}
      </p>
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
          {/* O "Hoje" pode ficar comprido: os quentes não esticam (sem um buraco vazio no cartão). */}
          <HotLeadsCard className="lg:col-start-2 lg:row-start-1 lg:self-start" />
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
