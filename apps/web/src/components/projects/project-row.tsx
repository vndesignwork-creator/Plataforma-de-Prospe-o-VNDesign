'use client';

/**
 * Um projeto na página Projetos: em cima o prazo, a fase e as ações (WhatsApp,
 * reunião, concluir); depois o resumo (pagamentos, tarefas, revisões, horas);
 * as tarefas e, ao lado, o tempo (Pomodoro e cronómetro); em baixo o resto.
 */
import { formatCurrency, formatDate, formatDuration, hourlyRate, leadPath, type Features, type Lead, type Project } from '@vndesign/core';
import { ArrowRight, CalendarClock, CalendarPlus, ChevronDown, Clock, FolderOpen, ListChecks, Plus, Receipt, RefreshCcw, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MeetingDialog, meetingLabel } from '@/components/meetings/meetings-card';
import { WhatsAppMenu } from '@/components/leads/whatsapp-menu';
import { ServiceChips } from '@/components/services/services';
import { TasksCard } from '@/components/tasks/tasks-card';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PlanForm } from './payments-card';
import { DueBadge, ProgressBar, StageMenu, SummaryStat } from './project-bits';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { PomodoroBox } from './pomodoro';
import { ProjectToggle } from './project-toggle';
import { TimeSection, TimerButton } from './time-section';

const euros = (v: number) => formatCurrency(v, { decimals: false });

function PaymentsStat({ project }: { project: Project }) {
  const { lead, payments } = project;
  const [plan, setPlan] = useState(false);
  return (
    <SummaryStat
      icon={Wallet}
      title="Pagamentos"
      tone={payments.overdue ? 'danger' : undefined}
      value={
        payments.total ? (
          <>
            {euros(payments.paid)} de {euros(payments.total)}
            {payments.overdue ? <span className="block text-xs font-medium">{euros(payments.overdue)} em atraso</span> : null}
          </>
        ) : (
          <span className="font-normal text-muted">Sem plano</span>
        )
      }
    >
      {payments.total ? (
        <ProgressBar value={payments.paid} total={payments.total} tone="success" label={`Recebido de ${lead.company_name}: ${euros(payments.paid)} de ${euros(payments.total)}`} />
      ) : (
        <button type="button" onClick={() => setPlan(true)} className="inline-flex items-center gap-1 self-start text-xs font-medium text-accent-text hover:underline">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Criar plano
        </button>
      )}
      {plan ? (
        <Dialog open onOpenChange={(o) => (!o ? setPlan(false) : undefined)} title="Plano de pagamentos" description={lead.company_name} className="max-w-xl">
          <div className="-m-4">
            <PlanForm lead={lead} onDone={() => setPlan(false)} />
          </div>
        </Dialog>
      ) : null}
    </SummaryStat>
  );
}

/**
 * Todas as tarefas do projeto (a mesma lista da ficha): marcar como feitas,
 * arrastar pela pega para mudar a ordem, editar, apagar e acrescentar.
 */
function TasksBlock({ project }: { project: Project }) {
  const { lead } = project;
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">Tarefas</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} aria-hidden />
          {open ? 'Esconder tarefas' : 'Mostrar tarefas'}
        </button>
      </div>
      {open ? <TasksCard lead={lead} embedded /> : null}
    </div>
  );
}

/** Chave do "recolhido" de cada projeto (ver setCollapsedKeys). */
export const projectCollapseKey = (leadId: string) => `projeto:${leadId}`;

export function ProjectRow({
  project,
  today,
  features,
  onWrapUp,
}: {
  project: Project;
  today: string;
  features: Features;
  onWrapUp: (lead: Lead) => void;
}) {
  const { lead, info, next_meeting: meeting, revisions, time, deliverables, value, tasks } = project;
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const completed = !!lead.project_completed_at;
  const rate = hourlyRate(value, time.minutes);
  const pomodoro = !completed && features.time_tracking && features.pomodoro;
  // Recolhido: só a linha do título (fica lembrado neste browser, por projeto).
  const [collapsed, setCollapsed] = useCollapsed(projectCollapseKey(lead.id));

  const timeColumn = !completed && features.time_tracking;

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-[1_1_16rem]">
          <div className="flex items-start gap-1">
            <CollapseButton
              collapsed={collapsed}
              onToggle={() => setCollapsed(!collapsed)}
              label={`${lead.company_name}${lead.project_title ? ` · ${lead.project_title}` : ''}`}
              className="-my-1 -ml-2 shrink-0"
            />
            <Link href={leadPath(lead)} className="min-w-0 font-semibold hover:text-accent-text hover:underline">
              <span className="mr-1.5 text-muted tabular">#{lead.number}</span>
              {lead.company_name} {lead.project_title ? <span className="font-normal text-muted">· {lead.project_title}</span> : null}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {completed ? (
              <Badge tone="success">Concluído a {formatDate(lead.project_completed_at!.slice(0, 10))}</Badge>
            ) : (
              <>
                <StageMenu leadId={lead.id} stage={info.stage} />
                <DueBadge dueOn={info.due_on} today={today} />
              </>
            )}
            {lead.services?.length ? <ServiceChips services={lead.services} /> : null}
          </div>
          {collapsed ? (
            <p className="text-xs text-muted tabular">
              {[
                tasks.total ? `Tarefas ${tasks.done} de ${tasks.total}` : null,
                features.payments && project.payments.total ? `${euros(project.payments.paid)} de ${euros(project.payments.total)}` : null,
                features.payments && project.payments.overdue ? `${euros(project.payments.overdue)} em atraso` : null,
                features.time_tracking && time.logged_seconds > 0 ? formatDuration(time.logged_seconds) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
        {/* Telemóvel: botões em duas colunas, a toda a largura (o último ocupa a linha se sobrar). Computador: à direita. */}
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end [&>*:last-child:nth-child(odd)]:col-span-2">
          {!completed ? <WhatsAppMenu lead={lead} className={buttonClasses('outline', 'sm', 'max-sm:w-full')} /> : null}
          {!completed && features.meetings ? (
            <Button size="sm" variant="outline" onClick={() => setMeetingOpen(true)} className="max-sm:w-full">
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Reunião
            </Button>
          ) : null}
          <ProjectToggle lead={lead} onWrapUp={onWrapUp} className="max-sm:w-full" />
        </div>
      </div>

      {collapsed ? null : (
        <>
          {/* Resumo: pagamentos, tarefas, revisões e horas (2 por linha no telemóvel). */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]" role="group" aria-label={`Resumo de ${lead.company_name}`}>
            {features.payments ? <PaymentsStat project={project} /> : null}
            <SummaryStat icon={ListChecks} title="Tarefas" value={tasks.total ? `${tasks.done} de ${tasks.total}` : <span className="font-normal text-muted">Sem tarefas</span>}>
              {tasks.total ? <ProgressBar value={tasks.done} total={tasks.total} label={`Tarefas de ${lead.company_name}: ${tasks.done} de ${tasks.total}`} /> : null}
            </SummaryStat>
            {features.revisions ? (
              <SummaryStat icon={RefreshCcw} title="Revisões" value={`${revisions.used} de ${info.revisions_included}`} tone={revisions.used > info.revisions_included ? 'warning' : undefined}>
                {revisions.used > info.revisions_included ? <span className="text-xs text-warning">{revisions.used - info.revisions_included} a cobrar à parte</span> : null}
              </SummaryStat>
            ) : null}
            {features.time_tracking ? (
              <SummaryStat
                icon={Clock}
                title="Horas"
                value={
                  time.logged_seconds > 0 ? (
                    <>
                      {formatDuration(time.logged_seconds)}
                      {rate ? <span className="font-normal text-muted"> · {euros(rate)}/hora</span> : null}
                    </>
                  ) : (
                    <span className="font-normal text-muted">Sem registos</span>
                  )
                }
              >
                {time.minutes > 0 || time.logged_seconds > 0 ? (
                  <button type="button" onClick={() => setHoursOpen(true)} className="self-start text-xs font-medium text-accent-text hover:underline">
                    Ver registos
                  </button>
                ) : null}
              </SummaryStat>
            ) : null}
          </div>

          {/* Tarefas (mais largo) e o tempo: Pomodoro e cronómetro juntos. */}
          <div className={cn('grid gap-x-6 gap-y-3', timeColumn && (pomodoro ? 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : 'md:grid-cols-[minmax(0,1fr)_auto]'))}>
            <TasksBlock project={project} />
            {timeColumn ? (
              <div className="flex min-w-0 flex-col gap-1.5" role="group" aria-label="Tempo">
                <span className="text-xs font-medium text-muted">Tempo</span>
                {pomodoro ? <PomodoroBox lead={lead} compact /> : null}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> Cronómetro
                  </span>
                  <TimerButton leadId={lead.id} runningSince={time.running_since} loggedSeconds={time.logged_seconds} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
            {meeting && features.meetings ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Reunião: {meetingLabel(meeting.starts_at)}
              </span>
            ) : null}
            {features.expenses && project.expenses > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" aria-hidden /> Despesas {euros(project.expenses)}
                {value ? (
                  <>
                    {' · lucro '}
                    <span className={value - project.expenses < 0 ? 'font-medium text-danger' : 'font-medium text-success'}>{euros(value - project.expenses)}</span>
                  </>
                ) : null}
              </span>
            ) : null}
            {features.deliverables && deliverables.total > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Entregas {deliverables.approved} de {deliverables.total} aprovadas
              </span>
            ) : null}
            <Link href={`${leadPath(lead)}#projeto`} className="ml-auto inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
              Detalhes do projeto <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </>
      )}
      {meetingOpen ? <MeetingDialog lead={lead} onClose={() => setMeetingOpen(false)} /> : null}
      {hoursOpen ? (
        <Dialog open onOpenChange={(o) => (!o ? setHoursOpen(false) : undefined)} title="Horas" description={lead.company_name} className="max-w-xl">
          <TimeSection lead={lead} className="-mx-5 -my-4 border-t-0" />
        </Dialog>
      ) : null}
    </li>
  );
}
