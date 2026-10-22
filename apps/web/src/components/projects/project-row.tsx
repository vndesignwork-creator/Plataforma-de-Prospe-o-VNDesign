'use client';

/**
 * Um projeto na página Projetos: prazo, fase, progresso das tarefas e dos
 * pagamentos, e ações rápidas sem abrir a ficha (marcar a próxima tarefa como
 * feita, acrescentar tarefa, temporizador, WhatsApp, reunião, concluir).
 */
import { formatCurrency, formatDate, formatDuration, hourlyRate, leadPath, type Features, type Lead, type Project } from '@vndesign/core';
import { ArrowRight, CalendarClock, CalendarPlus, ChevronDown, Clock, FolderOpen, Receipt, RefreshCcw, Wallet } from 'lucide-react';
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
import { DueBadge, ProgressBar, StageMenu } from './project-bits';
import { ProjectToggle } from './project-toggle';
import { TimeSection, TimerButton } from './time-section';

const euros = (v: number) => formatCurrency(v, { decimals: false });

/**
 * Todas as tarefas do projeto (a mesma lista da ficha): marcar como feitas,
 * arrastar pela pega para mudar a ordem, editar, apagar e acrescentar.
 */
function TasksBlock({ project }: { project: Project }) {
  const { lead, tasks } = project;
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">Tarefas{tasks.total ? ` · ${tasks.done} de ${tasks.total}` : ''}</span>
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
      {tasks.total ? <ProgressBar value={tasks.done} total={tasks.total} label={`Tarefas de ${lead.company_name}: ${tasks.done} de ${tasks.total}`} /> : null}
      {open ? <TasksCard lead={lead} embedded /> : null}
    </div>
  );
}

function PaymentsBlock({ project }: { project: Project }) {
  const { lead, payments } = project;
  const [plan, setPlan] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={cn('text-xs font-medium', payments.overdue ? 'text-danger' : 'text-muted')}>
        Pagamentos
        {payments.total ? ` · ${euros(payments.paid)} de ${euros(payments.total)}` : ''}
        {payments.overdue ? ` · ${euros(payments.overdue)} em atraso` : ''}
      </span>
      {payments.total ? (
        <ProgressBar value={payments.paid} total={payments.total} tone="success" label={`Recebido de ${lead.company_name}: ${euros(payments.paid)} de ${euros(payments.total)}`} />
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Sem plano de pagamentos.
          <Button size="sm" variant="outline" onClick={() => setPlan(true)}>
            <Wallet className="h-3.5 w-3.5" aria-hidden /> Criar plano
          </Button>
        </div>
      )}
      {plan ? (
        <Dialog open onOpenChange={(o) => (!o ? setPlan(false) : undefined)} title="Plano de pagamentos" description={lead.company_name} className="max-w-xl">
          <div className="-m-4">
            <PlanForm lead={lead} onDone={() => setPlan(false)} />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

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
  const { lead, info, next_meeting: meeting, revisions, time, deliverables, value } = project;
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const completed = !!lead.project_completed_at;
  const rate = hourlyRate(value, time.minutes);

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-[1_1_16rem]">
          <Link href={leadPath(lead)} className="font-semibold hover:text-accent-text hover:underline">
            <span className="mr-1.5 text-muted tabular">#{lead.number}</span>
            {lead.company_name} {lead.project_title ? <span className="font-normal text-muted">· {lead.project_title}</span> : null}
          </Link>
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
        </div>
        {/* Telemóvel: botões em duas colunas, a toda a largura (o último ocupa a linha se sobrar). Computador: à direita. */}
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end [&>*:last-child:nth-child(odd)]:col-span-2">
          {!completed && features.time_tracking ? (
            <TimerButton leadId={lead.id} runningSince={time.running_since} loggedSeconds={time.logged_seconds} className="max-sm:w-full" />
          ) : null}
          {!completed ? <WhatsAppMenu lead={lead} className={buttonClasses('outline', 'sm', 'max-sm:w-full')} /> : null}
          {!completed && features.meetings ? (
            <Button size="sm" variant="outline" onClick={() => setMeetingOpen(true)} className="max-sm:w-full">
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Reunião
            </Button>
          ) : null}
          <ProjectToggle lead={lead} onWrapUp={onWrapUp} className="max-sm:w-full" />
        </div>
      </div>

      <div className={cn('grid gap-x-6 gap-y-3', features.payments && 'md:grid-cols-2')}>
        <TasksBlock project={project} />
        {features.payments ? <PaymentsBlock project={project} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {meeting && features.meetings ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Reunião: {meetingLabel(meeting.starts_at)}
          </span>
        ) : null}
        {features.revisions ? (
          <span className={cn('inline-flex items-center gap-1.5', revisions.used > info.revisions_included && 'font-medium text-warning')}>
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden /> Revisões {revisions.used} de {info.revisions_included}
          </span>
        ) : null}
        {features.time_tracking && (time.minutes > 0 || time.logged_seconds > 0) ? (
          <button type="button" onClick={() => setHoursOpen(true)} className="inline-flex items-center gap-1.5 hover:text-fg hover:underline">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {formatDuration(time.logged_seconds)} registadas
            {rate ? ` · ${euros(rate)}/hora` : ''} · ver registos
          </button>
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
      {meetingOpen ? <MeetingDialog lead={lead} onClose={() => setMeetingOpen(false)} /> : null}
      {hoursOpen ? (
        <Dialog open onOpenChange={(o) => (!o ? setHoursOpen(false) : undefined)} title="Horas" description={lead.company_name} className="max-w-xl">
          <TimeSection lead={lead} className="-mx-5 -my-4 border-t-0" />
        </Dialog>
      ) : null}
    </li>
  );
}
