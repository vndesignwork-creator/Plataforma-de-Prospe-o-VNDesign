'use client';

/**
 * Projetos: os clientes com o projeto em curso (ou concluídos). Em cada um, o
 * progresso das tarefas, a próxima tarefa, os pagamentos e a próxima reunião.
 */
import { formatCurrency, formatDate, leadPath, todayIso, type Project } from '@vndesign/core';
import { CalendarClock, ListChecks, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { StatTile } from '@/components/charts/stat-tile';
import { ServiceChips } from '@/components/services/services';
import { TaskProgress } from '@/components/tasks/task-progress';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { useBilling, useProjects, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { meetingLabel } from '@/components/meetings/meetings-card';
import { ProjectToggle } from './project-toggle';

const euros = (v: number) => formatCurrency(v, { decimals: false });

function ProjectRow({ project, today, showPayments }: { project: Project; today: string; showPayments: boolean }) {
  const { lead, tasks, next_task: next, payments, next_meeting: meeting } = project;
  const overdueTask = next?.due_on && next.due_on < today;
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={leadPath(lead)} className="font-semibold hover:text-accent-text hover:underline">
            <span className="mr-1.5 text-muted tabular">#{lead.number}</span>
            {lead.company_name}
          </Link>
          {lead.project_completed_at ? <Badge tone="success">Concluído a {formatDate(lead.project_completed_at.slice(0, 10))}</Badge> : null}
        </div>
        {lead.services.length ? <ServiceChips services={lead.services} /> : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          {tasks.total ? (
            <TaskProgress progress={tasks} long />
          ) : (
            <Link href={`${leadPath(lead)}#tarefas`} className="inline-flex items-center gap-1.5 text-xs text-accent-text hover:underline">
              <ListChecks className="h-3.5 w-3.5" aria-hidden /> Criar a lista de tarefas
            </Link>
          )}
          {showPayments && payments.total > 0 ? (
            <span className={cn('inline-flex items-center gap-1.5 text-xs', payments.overdue ? 'font-medium text-danger' : 'text-muted')}>
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              Recebido {euros(payments.paid)} de {euros(payments.total)}
              {payments.overdue ? ` · ${euros(payments.overdue)} em atraso` : ''}
            </span>
          ) : null}
          {meeting ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Reunião: {meetingLabel(meeting.starts_at)}
            </span>
          ) : null}
        </div>
        {next ? (
          <p className="text-sm">
            <span className="text-muted">Próxima tarefa: </span>
            {next.title}
            {next.due_on ? (
              <span className={cn('ml-1.5 text-xs tabular', overdueTask ? 'font-medium text-danger' : 'text-muted')}>
                ({overdueTask ? 'em atraso, ' : ''}
                {formatDate(next.due_on)})
              </span>
            ) : null}
          </p>
        ) : tasks.total ? (
          <p className="text-sm text-success">Todas as tarefas feitas.</p>
        ) : null}
      </div>
      <div className="shrink-0">
        <ProjectToggle lead={lead} />
      </div>
    </li>
  );
}

export function ProjectsView() {
  const [state, setState] = useState<'active' | 'completed'>('active');
  const { data: projects, isLoading } = useProjects(state);
  const { data: settings } = useSettings();
  const showPayments = settings?.features.payments ?? true;
  const { data: billing } = useBilling(showPayments);
  const [today] = useState(() => todayIso());

  return (
    <div className="flex flex-col gap-5">
      {showPayments && billing ? (
        <section aria-label="Faturação" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Projetos em curso" value={billing.active_projects} />
          <StatTile label="Recebido este mês" value={euros(billing.received_month)} />
          <StatTile label="Por receber" value={euros(billing.outstanding)} />
          <StatTile
            label="Em atraso"
            value={<span className={billing.overdue ? 'text-danger' : undefined}>{euros(billing.overdue)}</span>}
            hint={billing.overdue_count ? `${billing.overdue_count} pagamento${billing.overdue_count === 1 ? '' : 's'}` : undefined}
          />
        </section>
      ) : null}

      <div className="flex gap-2" role="group" aria-label="Que projetos mostrar">
        {(
          [
            ['active', 'Em curso'],
            ['completed', 'Concluídos'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={state === value}
            onClick={() => setState(value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text"
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : projects?.length ? (
          <ul className="divide-y divide-border" aria-label={state === 'active' ? 'Projetos em curso' : 'Projetos concluídos'}>
            {projects.map((p) => (
              <ProjectRow key={p.lead.id} project={p} today={today} showPayments={showPayments} />
            ))}
          </ul>
        ) : (
          <EmptyState title={state === 'active' ? 'Sem projetos em curso' : 'Ainda sem projetos concluídos'}>
            <p>
              {state === 'active'
                ? 'Quando um lead passa a “Cliente”, o projeto aparece aqui até o marcares como concluído.'
                : 'Os projetos que marcares como concluídos ficam aqui.'}
            </p>
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
