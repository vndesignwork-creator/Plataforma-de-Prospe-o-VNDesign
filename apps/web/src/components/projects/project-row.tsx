'use client';

/**
 * Um projeto na página Projetos: prazo, fase, progresso das tarefas e dos
 * pagamentos, e ações rápidas sem abrir a ficha (marcar a próxima tarefa como
 * feita, acrescentar tarefa, temporizador, WhatsApp, reunião, concluir).
 */
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate, formatMinutes, hourlyRate, leadPath, type Features, type Lead, type Project } from '@vndesign/core';
import { ArrowRight, CalendarClock, CalendarPlus, Clock, FolderOpen, Plus, RefreshCcw, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { MeetingDialog, meetingLabel } from '@/components/meetings/meetings-card';
import { WhatsAppMenu } from '@/components/leads/whatsapp-menu';
import { ServiceChips } from '@/components/services/services';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { PlanForm } from './payments-card';
import { DueBadge, ProgressBar, StageMenu } from './project-bits';
import { ProjectToggle } from './project-toggle';
import { TimerButton } from './time-section';

const euros = (v: number) => formatCurrency(v, { decimals: false });

/** Depois de mexer nas tarefas a partir da lista. */
function useRefreshTasks(leadId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['tasks', leadId] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    void qc.invalidateQueries({ queryKey: ['project-calendar'] });
  };
}

function TasksBlock({ project, today }: { project: Project; today: string }) {
  const { lead, tasks, next_task: next } = project;
  const refresh = useRefreshTasks(lead.id);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  // A tarefa marcada fica marcada até a lista trazer a seguinte.
  const [completed, setCompleted] = useState<string | null>(null);
  const overdue = next?.due_on && next.due_on < today;

  async function completeNext() {
    if (!next) return;
    setCompleted(next.id);
    try {
      await api(`/tasks/${next.id}`, { method: 'PATCH', body: { done: true } });
      toast.success(`Feito: ${next.title}.`);
      refresh();
    } catch (error) {
      setCompleted(null);
      toast.error(errorMessage(error));
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api(`/leads/${lead.id}/tasks`, { method: 'POST', body: { title } });
      setTitle('');
      toast.success('Tarefa acrescentada.');
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">Tarefas{tasks.total ? ` · ${tasks.done} de ${tasks.total}` : ''}</span>
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Tarefa
          </button>
        ) : null}
      </div>
      {tasks.total ? <ProgressBar value={tasks.done} total={tasks.total} label={`Tarefas de ${lead.company_name}: ${tasks.done} de ${tasks.total}`} /> : null}
      {next ? (
        <label className="flex items-start gap-2 text-sm">
          {/* Fica marcada logo ao tocar; a lista atualiza-se quando o servidor responde. */}
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={completed === next.id} disabled={completed === next.id} onChange={completeNext} aria-label={`Marcar como feita: ${next.title}`} />
          <span className="min-w-0">
            <span className="text-muted">Próxima: </span>
            {next.title}
            {next.due_on ? (
              <span className={cn('ml-1.5 text-xs tabular', overdue ? 'font-medium text-danger' : 'text-muted')}>
                ({overdue ? 'em atraso, ' : ''}
                {formatDate(next.due_on)})
              </span>
            ) : null}
          </span>
        </label>
      ) : tasks.total ? (
        <p className="text-sm text-success">Todas as tarefas feitas.</p>
      ) : !adding ? (
        <p className="text-sm text-muted">
          Sem tarefas.{' '}
          <Link href={`${leadPath(lead)}#tarefas`} className="text-accent-text hover:underline">
            Usar um modelo de tarefas
          </Link>
        </p>
      ) : null}
      {adding ? (
        <form onSubmit={add} className="flex gap-2" aria-label={`Nova tarefa para ${lead.company_name}`}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa" maxLength={300} className="h-9" autoFocus aria-label="Nova tarefa" />
          <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
            Acrescentar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Fechar
          </Button>
        </form>
      ) : null}
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
  const completed = !!lead.project_completed_at;
  const rate = hourlyRate(value, time.minutes);

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={leadPath(lead)} className="font-semibold hover:text-accent-text hover:underline">
              <span className="mr-1.5 text-muted tabular">#{lead.number}</span>
              {lead.company_name}
            </Link>
            {completed ? (
              <Badge tone="success">Concluído a {formatDate(lead.project_completed_at!.slice(0, 10))}</Badge>
            ) : (
              <>
                <StageMenu leadId={lead.id} stage={info.stage} />
                <DueBadge dueOn={info.due_on} today={today} />
              </>
            )}
          </div>
          {lead.services?.length ? <ServiceChips services={lead.services} className="mt-1.5" /> : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {!completed && features.time_tracking ? <TimerButton leadId={lead.id} runningSince={time.running_since} /> : null}
          {!completed ? <WhatsAppMenu lead={lead} className={buttonClasses('outline', 'sm')} /> : null}
          {!completed && features.meetings ? (
            <Button size="sm" variant="outline" onClick={() => setMeetingOpen(true)}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Reunião
            </Button>
          ) : null}
          <ProjectToggle lead={lead} onWrapUp={onWrapUp} />
        </div>
      </div>

      <div className={cn('grid gap-x-6 gap-y-3', features.payments && 'md:grid-cols-2')}>
        <TasksBlock project={project} today={today} />
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
        {features.time_tracking && time.minutes > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {formatMinutes(time.minutes)}
            {rate ? ` · ${euros(rate)}/hora` : ''}
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
    </li>
  );
}
