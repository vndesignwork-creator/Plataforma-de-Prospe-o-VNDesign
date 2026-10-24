'use client';

/**
 * Cartão "Projeto" na ficha de um cliente (na coluna larga): prazo e fase; o
 * resumo (pagamentos, tarefas, revisões, horas); as secções (briefing,
 * revisões, despesas, entregas, página para o cliente…) e, ao lado, o tempo
 * (Pomodoro e horas). Cada parte pode desligar-se em Definições → Funcionalidades.
 */
import { describeProjectStart, formatCurrency, formatDate, formatDuration, summarizePayments, todayIso, type Features, type Lead } from '@vndesign/core';
import { Clock, ListChecks, RefreshCcw, Wallet, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { errorMessage } from '@/lib/api-client';
import { useLeadTasks, usePayments, useProjectInfo, useProjectTime, useRevisions, useSettings, useStartProject, useUpdateProjectInfo } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useServiceCatalog } from '@/components/services/services';
import { BriefingSection } from './briefing-section';
import { CollaboratorsSection } from './collaborators-section';
import { DeliverablesSection } from './deliverables-section';
import { LaunchSection } from './launch-section';
import { ExpensesSection } from './expenses-section';
import { DueBadge, ProgressBar, StageMenu, StageSteps, SummaryStat } from './project-bits';
import { RevisionsSection } from './revisions-section';
import { ShareSection } from './share-section';
import { PomodoroBox } from './pomodoro';
import { ProjectUpdateButton, WelcomeButton } from './project-update';
import { TimeSection } from './time-section';

const euros = (v: number) => formatCurrency(v, { decimals: false });

/** Link de uma caixinha do resumo para a parte da ficha com o detalhe. */
function Jump({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="self-start text-xs font-medium text-accent-text hover:underline">
      {children}
    </a>
  );
}

/** Resumo do projeto em caixinhas (o mesmo da página Projetos). */
function ProjectSummary({ lead, features, revisionsIncluded }: { lead: Lead; features: Features; revisionsIncluded: number }) {
  const [today] = useState(() => todayIso());
  const { data: payments } = usePayments(lead.id, features.payments);
  const { data: tasks } = useLeadTasks(lead.id);
  const { data: revisions } = useRevisions(lead.id, features.revisions);
  const { data: time } = useProjectTime(lead.id, features.time_tracking);
  const pay = summarizePayments(payments ?? [], today);
  const done = (tasks ?? []).filter((t) => t.done_at).length;
  const total = (tasks ?? []).length;
  const used = revisions?.length ?? 0;
  return (
    <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]" role="group" aria-label="Resumo do projeto">
      {features.payments ? (
        <SummaryStat
          icon={Wallet}
          title="Pagamentos"
          tone={pay.overdue ? 'danger' : undefined}
          value={
            pay.total ? (
              <>
                {euros(pay.paid)} de {euros(pay.total)}
                {pay.overdue ? <span className="block text-xs font-medium">{euros(pay.overdue)} em atraso</span> : null}
              </>
            ) : (
              <span className="font-normal text-muted">Sem plano</span>
            )
          }
        >
          {pay.total ? (
            <ProgressBar value={pay.paid} total={pay.total} tone="success" label={`Recebido de ${lead.company_name}: ${euros(pay.paid)} de ${euros(pay.total)}`} />
          ) : (
            <Jump href="#pagamentos">Criar plano</Jump>
          )}
        </SummaryStat>
      ) : null}
      <SummaryStat icon={ListChecks} title="Tarefas" value={total ? `${done} de ${total}` : <span className="font-normal text-muted">Sem tarefas</span>}>
        {total ? <ProgressBar value={done} total={total} label={`Tarefas de ${lead.company_name}: ${done} de ${total}`} /> : <Jump href="#tarefas">Criar tarefas</Jump>}
      </SummaryStat>
      {features.revisions ? (
        <SummaryStat icon={RefreshCcw} title="Revisões" value={`${used} de ${revisionsIncluded}`} tone={used > revisionsIncluded ? 'warning' : undefined}>
          {used > revisionsIncluded ? <span className="text-xs text-warning">{used - revisionsIncluded} a cobrar à parte</span> : null}
        </SummaryStat>
      ) : null}
      {features.time_tracking ? (
        <SummaryStat
          icon={Clock}
          title="Horas"
          value={
            time && time.logged_seconds > 0 ? (
              <>
                {formatDuration(time.logged_seconds)}
                {time.hourly_rate ? <span className="font-normal text-muted"> · {euros(time.hourly_rate)}/hora</span> : null}
              </>
            ) : (
              <span className="font-normal text-muted">Sem registos</span>
            )
          }
        />
      ) : null}
    </div>
  );
}

export function ProjectCard({ lead }: { lead: Lead }) {
  const { data: settings } = useSettings();
  const { data: info, isLoading } = useProjectInfo(lead.id);
  const update = useUpdateProjectInfo(lead.id);
  const start = useStartProject(lead.id);
  const [today] = useState(() => todayIso());
  const features = settings?.features;
  const catalog = useServiceCatalog();
  // A checklist de lançamento só faz sentido com um site (serviços de Web Design, ou ainda sem serviços).
  const hasSite = !(lead.services ?? []).length || (lead.services ?? []).some((s) => catalog.get(s)?.category === 'web');
  const time = !!features?.time_tracking;

  async function prepare() {
    try {
      const result = await start.mutateAsync();
      toast.success(`Projeto preparado: ${describeProjectStart(result, formatDate)}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function setDue(value: string) {
    try {
      await update.mutateAsync({ due_on: value || null });
      toast.success(value ? 'Prazo de entrega guardado.' : 'Prazo de entrega removido.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card id="projeto" className="scroll-mt-20">
      <CardHeader
        title="Projeto"
        description={lead.project_completed_at ? 'Projeto concluído.' : 'Prazo, fase, resumo, revisões, entregas e tempo.'}
        actions={
          info ? (
            <>
              <WelcomeButton lead={lead} />
              <ProjectUpdateButton lead={lead} />
              <Button size="sm" variant="ghost" onClick={prepare} loading={start.isPending} title="Prazo e revisões pelos serviços; tarefas e plano de pagamentos se ainda não houver">
                <Zap className="h-3.5 w-3.5" aria-hidden /> Preparar
              </Button>
              <StageMenu leadId={lead.id} stage={info.stage} />
            </>
          ) : null
        }
      />
      {isLoading || !info ? (
        <div className="p-4">
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="@container">
          <div className="flex flex-col gap-3 px-4 py-3">
            <StageSteps stage={info.stage} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor={`due-${lead.id}`} className="text-sm font-medium">
                Prazo de entrega
              </label>
              <DateInput id={`due-${lead.id}`} value={info.due_on} onChange={(v) => void setDue(v)} className="w-40" />
              {!lead.project_completed_at ? <DueBadge dueOn={info.due_on} today={today} /> : null}
            </div>
            {features ? <ProjectSummary lead={lead} features={features} revisionsIncluded={info.revisions_included} /> : null}
          </div>
          {/* Computador: as secções à esquerda e o tempo (Pomodoro e horas) à direita; telemóvel: um a seguir ao outro. */}
          <div className={cn('grid border-t border-border', time && '@2xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]')}>
            <div className="flex min-w-0 flex-col [&>*:first-child]:border-t-0">
              {features?.briefing ? <BriefingSection lead={lead} /> : null}
              {features?.revisions ? <RevisionsSection lead={lead} /> : null}
              {features?.expenses ? <ExpensesSection lead={lead} /> : null}
              {features?.deliverables ? <DeliverablesSection lead={lead} /> : null}
              {features?.launch_checklist && hasSite ? <LaunchSection lead={lead} /> : null}
              {features?.client_page ? <ShareSection lead={lead} /> : null}
              {features?.collaborators ? <CollaboratorsSection lead={lead} /> : null}
            </div>
            {time ? (
              <div role="group" aria-label="Tempo" className="flex min-w-0 flex-col border-t border-border @2xl:border-t-0 @2xl:border-l">
                {features?.pomodoro && !lead.project_completed_at ? (
                  <div className="px-4 py-3">
                    <PomodoroBox lead={lead} compact />
                  </div>
                ) : null}
                <TimeSection lead={lead} className={features?.pomodoro && !lead.project_completed_at ? undefined : 'border-t-0'} />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
