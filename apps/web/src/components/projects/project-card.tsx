'use client';

/**
 * Cartão "Projeto" na ficha de um cliente (o primeiro, na coluna larga): fases
 * (clicáveis), prazo e o resumo (pagamentos, tarefas, revisões, horas); as
 * partes em separadores — Trabalho e entregas, Tempo e dinheiro, Cliente e
 * equipa (o separador fica lembrado). Cada parte pode desligar-se em
 * Definições → Funcionalidades.
 */
import { describeProjectStart, formatCurrency, formatDate, formatDuration, summarizePayments, todayIso, type Features, type Lead } from '@vndesign/core';
import { Clock, ListChecks, MoreHorizontal, RefreshCcw, Wallet, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { errorMessage } from '@/lib/api-client';
import { useLeadTasks, usePayments, useProjectInfo, useProjectTime, useRevisions, useSettings, useStartProject, useUpdateProjectInfo } from '@/lib/queries';
import { buttonClasses } from '@/components/ui/button';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';
import { useServiceCatalog } from '@/components/services/services';
import { BriefingSection } from './briefing-section';
import { CollaboratorsSection } from './collaborators-section';
import { DeliverablesSection } from './deliverables-section';
import { LaunchSection } from './launch-section';
import { ExpensesSection } from './expenses-section';
import { DueBadge, ProgressBar, StagePicker, SummaryStat } from './project-bits';
import { RevisionsSection } from './revisions-section';
import { ShareSection } from './share-section';
import { PomodoroBox } from './pomodoro';
import { ProjectToggle } from './project-toggle';
import { ProjectUpdateButton, WelcomeButton } from './project-update';
import { TimeSection } from './time-section';
import { rovingKeyDown, rovingTabIndex } from '@/lib/roving';

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

const PROJECT_TABS = [
  { id: 'trabalho', label: 'Trabalho e entregas', short: 'Trabalho' },
  { id: 'tempo', label: 'Tempo e dinheiro', short: 'Tempo e €' },
  { id: 'cliente', label: 'Cliente e equipa', short: 'Cliente' },
] as const;
type ProjectTab = (typeof PROJECT_TABS)[number]['id'];
const TAB_KEY = 'vnd.projeto.tab';

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
  const [tab, setTab] = useState<ProjectTab>('trabalho');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as ProjectTab | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- só depois de montar (localStorage)
      if (saved && PROJECT_TABS.some((t) => t.id === saved)) setTab(saved);
    } catch {
      // sem localStorage: começa em "Trabalho e entregas"
    }
  }, []);
  function choose(next: ProjectTab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // ignora
    }
  }

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

  // As partes do projeto, em separadores (os mesmos grupos de Definições → Funcionalidades).
  const panels: Record<ProjectTab, ReactNode[]> = {
    trabalho: [
      features?.briefing ? <BriefingSection key="briefing" lead={lead} /> : null,
      features?.revisions ? <RevisionsSection key="revisions" lead={lead} /> : null,
      features?.deliverables ? <DeliverablesSection key="deliverables" lead={lead} /> : null,
      features?.launch_checklist && hasSite ? <LaunchSection key="launch" lead={lead} /> : null,
    ].filter(Boolean),
    tempo: [
      time ? (
        <div key="time" role="group" aria-label="Tempo" className="flex min-w-0 flex-col">
          {features?.pomodoro && !lead.project_completed_at ? (
            <div className="px-4 py-3">
              <PomodoroBox lead={lead} compact />
            </div>
          ) : null}
          <TimeSection lead={lead} className={features?.pomodoro && !lead.project_completed_at ? undefined : 'border-t-0'} />
        </div>
      ) : null,
      features?.expenses ? <ExpensesSection key="expenses" lead={lead} /> : null,
    ].filter(Boolean),
    cliente: [
      features?.client_page ? <ShareSection key="share" lead={lead} /> : null,
      features?.collaborators ? <CollaboratorsSection key="collab" lead={lead} /> : null,
    ].filter(Boolean),
  };
  const tabs = PROJECT_TABS.filter((t) => panels[t.id].length);
  const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? 'trabalho');

  return (
    <Card id="projeto" className="scroll-mt-20">
      <CardHeader
        title="Projeto"
        description={lead.project_completed_at ? 'Projeto concluído.' : undefined}
        actions={
          info ? (
            <>
              <WelcomeButton lead={lead} />
              <ProjectUpdateButton lead={lead} />
              <ProjectToggle lead={lead} />
              <DropdownRoot>
                <DropdownTrigger className={buttonClasses('ghost', 'icon', 'h-8 w-8')} aria-label="Mais ações do projeto">
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem onSelect={() => void prepare()} disabled={start.isPending}>
                    <Zap className="h-4 w-4 text-muted" aria-hidden />
                    <span>
                      Preparar
                      <span className="block text-xs text-muted">Prazo e revisões pelos serviços; tarefas e pagamentos se ainda não houver</span>
                    </span>
                  </DropdownItem>
                </DropdownContent>
              </DropdownRoot>
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
          {/* Visão geral: fases (clicáveis), prazo e o resumo. */}
          <div className="flex flex-col gap-3 px-4 py-3">
            <StagePicker leadId={lead.id} stage={info.stage} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor={`due-${lead.id}`} className="text-sm font-medium">
                Prazo de entrega
              </label>
              <DateInput id={`due-${lead.id}`} value={info.due_on} onChange={(v) => void setDue(v)} className="w-40" />
              {!lead.project_completed_at ? <DueBadge dueOn={info.due_on} today={today} /> : null}
            </div>
            {features ? <ProjectSummary lead={lead} features={features} revisionsIncluded={info.revisions_included} /> : null}
          </div>
          {tabs.length ? (
            <>
              <div role="tablist" aria-label="Partes do projeto" onKeyDown={rovingKeyDown} className="flex overflow-x-auto border-t border-b border-border px-2 [scrollbar-width:none]">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`projeto-tab-${t.id}`}
                    aria-selected={active === t.id}
                    aria-controls={`projeto-painel-${t.id}`}
                    tabIndex={rovingTabIndex(active === t.id, 0)}
                    onClick={() => choose(t.id)}
                    className={cn(
                      '-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap',
                      active === t.id ? 'border-accent font-medium text-accent-text' : 'border-transparent text-muted hover:text-fg',
                    )}
                  >
                    {/* Telemóvel: nomes curtos (os três cabem); o nome completo fica para leitores de ecrã. */}
                    <span className="sm:hidden" aria-hidden>
                      {t.short}
                    </span>
                    <span className="max-sm:sr-only">{t.label}</span>
                    <span className="rounded bg-surface-3 px-1.5 text-xs text-muted tabular">{panels[t.id].length}</span>
                  </button>
                ))}
              </div>
              {tabs.map((t) => (
                // Todos montados (os dados ficam prontos); só o separador ativo se vê.
                <div
                  key={t.id}
                  id={`projeto-painel-${t.id}`}
                  role="tabpanel"
                  aria-labelledby={`projeto-tab-${t.id}`}
                  hidden={active !== t.id}
                  className="flex min-w-0 flex-col [&>*:first-child]:border-t-0"
                >
                  {panels[t.id]}
                </div>
              ))}
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}
