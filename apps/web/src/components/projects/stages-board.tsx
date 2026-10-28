'use client';

/**
 * Projetos em colunas por fase (Briefing → Em produção → Revisões → Entrega).
 * Arrasta-se o cartão para mudar de fase (no telemóvel: manter o dedo) ou usa-se
 * o botão da fase no próprio cartão.
 */
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { PROJECT_STAGE_LABELS, PROJECT_STAGES, leadPath, type Project, type ProjectStage } from '@vndesign/core';
import { GripVertical } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { DueBadge, ProgressBar, STAGE_COLORS, StageMenu } from './project-bits';

function StageCard({ project, today, dragging, handle }: { project: Project; today: string; dragging?: boolean; handle?: React.ReactNode }) {
  const { lead, info, tasks, next_task: next } = project;
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-3 text-sm shadow-sm', dragging && 'rotate-1 border-accent shadow-card')}>
      <div className="flex items-start gap-2">
        {handle ?? <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />}
        <div className="min-w-0 flex-1">
          <Link href={leadPath(lead)} className="block font-semibold leading-snug hover:text-accent-text hover:underline" draggable={false}>
            <span className="text-muted tabular">#{lead.number}</span> {lead.company_name}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DueBadge dueOn={info.due_on} today={today} />
            {!dragging ? <StageMenu leadId={lead.id} stage={info.stage} /> : null}
          </div>
          {tasks.total ? <ProgressBar className="mt-2" value={tasks.done} total={tasks.total} label={`Tarefas: ${tasks.done} de ${tasks.total}`} /> : null}
          {next ? <p className="mt-1.5 truncate text-xs text-muted">Próxima: {next.title}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DraggableCard({ project, today }: { project: Project; today: string }) {
  // Quem segue o rato é a cópia (DragOverlay); o original fica no sítio, esbatido.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: project.lead.id });
  return (
    <li
      ref={setNodeRef}
      className={cn('touch-manipulation pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]', isDragging && 'opacity-40')}
      {...listeners}
    >
      <StageCard
        project={project}
        today={today}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            aria-roledescription="cartão arrastável"
            aria-label={`Mover #${project.lead.number} ${project.lead.company_name}, fase ${PROJECT_STAGE_LABELS[project.info.stage]}`}
            className="-m-1 shrink-0 cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-3 hover:text-fg"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        }
      />
    </li>
  );
}

function StageColumn({ stage, projects, today }: { stage: ProjectStage; projects: Project[]; today: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      aria-labelledby={`stage-${stage}`}
      className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface-2/60', isOver && 'border-accent')}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <h2 id={`stage-${stage}`} className="flex items-center gap-2 font-sans text-sm font-semibold">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} aria-hidden />
          {PROJECT_STAGE_LABELS[stage]}
          <span className="rounded bg-surface-3 px-1.5 text-xs font-medium tabular text-muted">{projects.length}</span>
        </h2>
      </header>
      <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 p-2" aria-label={`Projetos em ${PROJECT_STAGE_LABELS[stage]}`}>
        {projects.map((p) => (
          <DraggableCard key={p.lead.id} project={p} today={today} />
        ))}
        {projects.length === 0 ? <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">Arrasta um projeto para aqui</li> : null}
      </ul>
    </section>
  );
}

export function StagesBoard({ projects, today }: { projects: Project[]; today: string }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const active = projects.find((p) => p.lead.id === activeId) ?? null;

  async function onDragEnd({ active: a, over }: DragEndEvent) {
    setActiveId(null);
    const project = projects.find((p) => p.lead.id === a.id);
    const stage = over?.id as ProjectStage | undefined;
    if (!project || !stage || stage === project.info.stage) return;
    // Otimista: muda já de coluna; volta atrás se o servidor recusar.
    const key = ['projects', 'active'];
    const before = qc.getQueryData<Project[]>(key);
    qc.setQueryData<Project[]>(key, (list) => list?.map((p) => (p.lead.id === project.lead.id ? { ...p, info: { ...p.info, stage } } : p)));
    try {
      await api(`/leads/${project.lead.id}/project`, { method: 'PATCH', body: { stage } });
      toast.success(`${project.lead.company_name}: ${PROJECT_STAGE_LABELS[stage]}.`);
      void qc.invalidateQueries({ queryKey: ['project', project.lead.id] });
      void qc.invalidateQueries({ queryKey: ['activities', project.lead.id] });
    } catch (error) {
      qc.setQueryData(key, before);
      toast.error(errorMessage(error));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: a }) => setActiveId(String(a.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'Para mudar a fase, carrega em Espaço ou Enter, usa as setas e Espaço ou Enter para largar. Esc cancela.',
        },
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PROJECT_STAGES.map((stage) => (
          <StageColumn key={stage} stage={stage} projects={projects.filter((p) => p.info.stage === stage)} today={today} />
        ))}
      </div>
      <DragOverlay>{active ? <StageCard project={active} today={today} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
