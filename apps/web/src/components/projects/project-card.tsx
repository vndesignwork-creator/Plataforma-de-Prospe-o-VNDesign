'use client';

/**
 * Cartão "Projeto" na ficha de um cliente: prazo de entrega, fase, revisões,
 * horas, ficheiros/entregas e a página para o cliente (cada parte pode
 * desligar-se em Definições → Funcionalidades).
 */
import { describeProjectStart, formatDate, todayIso, type Lead } from '@vndesign/core';
import { Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { errorMessage } from '@/lib/api-client';
import { useProjectInfo, useSettings, useStartProject, useUpdateProjectInfo } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { BriefingSection } from './briefing-section';
import { DeliverablesSection } from './deliverables-section';
import { ExpensesSection } from './expenses-section';
import { DueBadge, StageMenu, StageSteps } from './project-bits';
import { RevisionsSection } from './revisions-section';
import { ShareSection } from './share-section';
import { TimeSection } from './time-section';

export function ProjectCard({ lead }: { lead: Lead }) {
  const { data: settings } = useSettings();
  const { data: info, isLoading } = useProjectInfo(lead.id);
  const update = useUpdateProjectInfo(lead.id);
  const start = useStartProject(lead.id);
  const [today] = useState(() => todayIso());
  const features = settings?.features;

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
        description={lead.project_completed_at ? 'Projeto concluído.' : 'Prazo, fase, revisões, horas e entregas.'}
        actions={
          info ? (
            <>
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
        <>
          <div className="flex flex-col gap-3 px-4 py-3">
            <StageSteps stage={info.stage} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor={`due-${lead.id}`} className="text-sm font-medium">
                Prazo de entrega
              </label>
              <DateInput id={`due-${lead.id}`} value={info.due_on} onChange={(v) => void setDue(v)} className="w-40" />
              {!lead.project_completed_at ? <DueBadge dueOn={info.due_on} today={today} /> : null}
            </div>
          </div>
          {features?.briefing ? <BriefingSection lead={lead} /> : null}
          {features?.revisions ? <RevisionsSection lead={lead} /> : null}
          {features?.time_tracking ? <TimeSection lead={lead} /> : null}
          {features?.expenses ? <ExpensesSection lead={lead} /> : null}
          {features?.deliverables ? <DeliverablesSection lead={lead} /> : null}
          {features?.client_page ? <ShareSection lead={lead} /> : null}
        </>
      )}
    </Card>
  );
}
