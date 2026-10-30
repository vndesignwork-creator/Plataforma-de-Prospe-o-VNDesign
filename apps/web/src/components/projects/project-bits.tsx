'use client';

/** Peças pequenas dos projetos: prazo ("Faltam 5 dias"), fase (menu) e barra de progresso. */
import { PROJECT_STAGE_LABELS, PROJECT_STAGES, dueStatus, formatDate, type LeadStatus, type ProjectStage } from '@vndesign/core';
import { CalendarClock, ChevronDown, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownContent, DropdownLabel, DropdownRadioGroup, DropdownRadioItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { errorMessage } from '@/lib/api-client';
import { useUpdateProjectInfo } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Estados antes da reunião/proposta: ainda sem pagamentos nem contratos (os cartões nem perguntam ao servidor). */
export const EARLY_STATUSES: readonly LeadStatus[] = ['identificado', 'contactado', 'respondeu'];

/** Cor de cada fase (pontos e colunas). */
export const STAGE_COLORS: Record<ProjectStage, string> = {
  briefing: '#8b8b8b',
  producao: '#4f8cff',
  revisoes: '#e5a03a',
  entrega: '#3fb67b',
};

const TONES = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  muted: 'bg-surface-3 text-muted',
} as const;

/** "Faltam 5 dias" / "Entrega hoje" / "Atrasado 2 dias" (com a data no title). */
export function DueBadge({ dueOn, today, className }: { dueOn: string | null; today: string; className?: string }) {
  const due = dueStatus(dueOn, today);
  if (!due || !dueOn) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[due.tone], className)}
      title={`Prazo de entrega: ${formatDate(dueOn)}`}
    >
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {due.label}
      <span className="sr-only"> (prazo {formatDate(dueOn)})</span>
    </span>
  );
}

/** Ponto colorido + nome da fase. */
export function StageLabel({ stage }: { stage: ProjectStage }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} aria-hidden />
      {PROJECT_STAGE_LABELS[stage]}
    </span>
  );
}

/** Botão com a fase atual que abre a lista de fases (muda com um toque). */
export function StageMenu({ leadId, stage, className }: { leadId: string; stage: ProjectStage; className?: string }) {
  const update = useUpdateProjectInfo(leadId);
  async function change(next: string) {
    if (next === stage) return;
    try {
      await update.mutateAsync({ stage: next as ProjectStage });
      toast.success(`Fase: ${PROJECT_STAGE_LABELS[next as ProjectStage]}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <DropdownRoot>
      <DropdownTrigger
        aria-label={`Fase do projeto: ${PROJECT_STAGE_LABELS[stage]}. Mudar`}
        className={cn(
          'inline-flex min-h-7 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs font-medium hover:bg-surface-3 data-[state=open]:bg-surface-3 pointer-coarse:min-h-9',
          className,
        )}
      >
        <StageLabel stage={stage} />
        <ChevronDown className="h-3 w-3 text-muted" aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="start" className="min-w-44">
        <DropdownLabel>Fase do projeto</DropdownLabel>
        <DropdownRadioGroup value={stage} onValueChange={(v) => void change(v)}>
          {PROJECT_STAGES.map((s) => (
            <DropdownRadioItem key={s} value={s}>
              <StageLabel stage={s} />
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </DropdownRoot>
  );
}

/** Passos das fases (Briefing → … → Entrega), com a atual destacada. */
export function StageSteps({ stage, className }: { stage: ProjectStage; className?: string }) {
  const current = PROJECT_STAGES.indexOf(stage);
  return (
    <ol className={cn('flex items-center gap-1', className)} aria-label="Fases do projeto">
      {PROJECT_STAGES.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 flex-col gap-1" aria-current={i === current ? 'step' : undefined}>
          <span className={cn('h-1.5 rounded-full', i <= current ? 'bg-accent' : 'bg-surface-3')} aria-hidden />
          <span className={cn('truncate text-[11px]', i === current ? 'font-semibold text-fg' : 'text-muted')}>
            {i < current ? '✓ ' : ''}
            {PROJECT_STAGE_LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** As fases como botões (ficha do cliente): carregar numa muda a fase do projeto. */
export function StagePicker({ leadId, stage, className }: { leadId: string; stage: ProjectStage; className?: string }) {
  const update = useUpdateProjectInfo(leadId);
  const current = PROJECT_STAGES.indexOf(stage);
  async function change(next: ProjectStage) {
    if (next === stage) return;
    try {
      await update.mutateAsync({ stage: next });
      toast.success(`Fase: ${PROJECT_STAGE_LABELS[next]}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <div role="group" aria-label="Fase do projeto (carrega para mudar)" className={cn('flex items-stretch gap-1', className)}>
      {PROJECT_STAGES.map((s, i) => (
        <button
          key={s}
          type="button"
          aria-pressed={i === current}
          aria-label={`Fase ${PROJECT_STAGE_LABELS[s]}`}
          disabled={update.isPending}
          onClick={() => void change(s)}
          title={i === current ? `Fase atual: ${PROJECT_STAGE_LABELS[s]}` : `Mudar a fase para ${PROJECT_STAGE_LABELS[s]}`}
          className="group flex min-w-0 flex-1 flex-col gap-1 rounded-md px-0.5 py-1 text-left hover:bg-surface-2 disabled:opacity-70"
        >
          <span className={cn('h-1.5 rounded-full transition-colors', i <= current ? 'bg-accent' : 'bg-surface-3 group-hover:bg-muted/40')} aria-hidden />
          <span className={cn('truncate text-[11px]', i === current ? 'font-semibold text-fg' : 'text-muted group-hover:text-fg')}>
            {i < current ? '✓ ' : ''}
            {PROJECT_STAGE_LABELS[s]}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Barra larga com a percentagem (tarefas, pagamentos). */
export function ProgressBar({
  value,
  total,
  label,
  tone = 'accent',
  className,
}: {
  value: number;
  total: number;
  label: string;
  tone?: 'accent' | 'success';
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const complete = pct >= 100;
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <span className={cn('block h-full rounded-full', complete || tone === 'success' ? 'bg-success' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn('w-9 shrink-0 text-right text-xs font-semibold tabular', complete ? 'text-success' : 'text-muted')}>{pct}%</span>
    </div>
  );
}

/** Uma caixinha do resumo do projeto: título, número e barra (ou a ação, quando ainda não há nada). */
export function SummaryStat({
  icon: Icon,
  title,
  value,
  tone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  value: React.ReactNode;
  tone?: 'danger' | 'warning';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
      </span>
      <span className={cn('text-sm font-semibold tabular', tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg')}>{value}</span>
      {children}
    </div>
  );
}
