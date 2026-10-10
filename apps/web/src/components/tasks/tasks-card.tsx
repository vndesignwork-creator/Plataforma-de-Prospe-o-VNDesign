'use client';

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatDate,
  splitTasks,
  suggestTaskTemplates,
  todayIso,
  type Lead,
  type LeadTask,
  type TaskTemplate,
} from '@vndesign/core';
import { ChevronRight, GripVertical, ListPlus, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateTasks, useLeadTasks, useTaskTemplates } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { TaskProgress } from './task-progress';

/** Prazo da tarefa: vermelho em atraso, laranja hoje. */
export function DueChip({ due, today, done }: { due: string | null; today: string; done?: boolean }) {
  if (!due) return null;
  const overdue = !done && due < today;
  const isToday = !done && due === today;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 text-xs tabular',
        overdue ? 'bg-danger-soft font-medium text-danger' : isToday ? 'bg-accent-soft font-medium text-accent-text' : 'bg-surface-3 text-muted',
      )}
    >
      {formatDate(due)}
      {overdue ? <span className="sr-only"> (em atraso)</span> : isToday ? <span className="sr-only"> (hoje)</span> : null}
    </span>
  );
}

function TaskEditor({
  task,
  onSave,
  onCancel,
}: {
  task: LeadTask;
  onSave: (patch: { title: string; due_on: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due_on ?? '');
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), due_on: due || null });
    setSaving(false);
  }
  return (
    <form onSubmit={submit} className="flex flex-1 flex-wrap items-center gap-2" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Texto da tarefa"
        autoFocus
        className="min-w-40 flex-[1_1_12rem]"
      />
      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Prazo da tarefa" className="w-auto" />
      <Button type="submit" size="sm" loading={saving}>
        Guardar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  );
}

function TaskRow({
  task,
  today,
  editing,
  sortable,
  onToggle,
  onEdit,
  onSave,
  onCancelEdit,
  onDelete,
}: {
  task: LeadTask;
  today: string;
  editing: boolean;
  sortable: boolean;
  onToggle: (done: boolean) => void;
  onEdit: () => void;
  onSave: (patch: { title: string; due_on: string | null }) => Promise<void>;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !sortable || editing,
  });
  const done = Boolean(task.done_at);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex items-start gap-2 px-3 py-2 hover:bg-surface-2', isDragging && 'relative z-10 bg-surface-2 opacity-80 shadow-card')}
    >
      {sortable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-roledescription="tarefa arrastável"
          aria-label={`Mover a tarefa: ${task.title}`}
          className="-my-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-3 hover:text-fg pointer-coarse:p-1.5"
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
      />
      {editing ? (
        <TaskEditor task={task} onSave={onSave} onCancel={onCancelEdit} />
      ) : (
        <>
          <button
            type="button"
            onClick={onEdit}
            className={cn('min-w-0 flex-1 text-left text-sm break-words', done && 'text-muted line-through')}
            title="Editar"
          >
            {task.title}
            {task.due_on ? (
              <>
                {' '}
                <DueChip due={task.due_on} today={today} done={done} />
              </>
            ) : null}
          </button>
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 pointer-coarse:opacity-100">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Editar: ${task.title}`}
              className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg max-sm:hidden"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Apagar: ${task.title}`}
              className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger pointer-coarse:p-1.5"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </span>
        </>
      )}
    </li>
  );
}

function TemplateMenu({ templates, suggested, onApply }: { templates: TaskTemplate[]; suggested: TaskTemplate[]; onApply: (t: TaskTemplate) => void }) {
  const others = templates.filter((t) => !suggested.includes(t));
  return (
    <DropdownRoot>
      <DropdownTrigger className={buttonClasses('outline', 'sm')}>
        <ListPlus className="h-3.5 w-3.5" aria-hidden />
        Usar lista
      </DropdownTrigger>
      <DropdownContent>
        {suggested.length ? (
          <>
            <DropdownLabel>Para os serviços deste lead</DropdownLabel>
            {suggested.map((t) => (
              <DropdownItem key={t.id} onSelect={() => onApply(t)}>
                {t.name} <span className="ml-auto text-xs text-muted tabular">{t.items.length}</span>
              </DropdownItem>
            ))}
            {others.length ? <DropdownSeparator /> : null}
          </>
        ) : null}
        {others.length ? <DropdownLabel>{suggested.length ? 'Outras listas' : 'Listas prontas'}</DropdownLabel> : null}
        {others.map((t) => (
          <DropdownItem key={t.id} onSelect={() => onApply(t)}>
            {t.name} <span className="ml-auto text-xs text-muted tabular">{t.items.length}</span>
          </DropdownItem>
        ))}
        {!templates.length ? <DropdownLabel>Sem listas (Definições → Listas de tarefas)</DropdownLabel> : null}
      </DropdownContent>
    </DropdownRoot>
  );
}

/** Cartão "Tarefas" da ficha: lista com caixas, por ordem (arrastar), prazos e listas prontas por serviço. */
export function TasksCard({ lead }: { lead: Lead }) {
  const today = todayIso();
  const qc = useQueryClient();
  const key = ['tasks', lead.id];
  const invalidate = useInvalidateTasks();
  const { data: tasks, isLoading, error: loadError } = useLeadTasks(lead.id);
  const { data: templates } = useTaskTemplates();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  // Ao abrir a ficha por um link para as tarefas (ex.: "Criar tarefas" no Kanban), descer até aqui
  // quando a lista já tem altura (o browser tentou antes de o cartão existir).
  useEffect(() => {
    if (!isLoading && window.location.hash === '#tarefas') document.getElementById('tarefas')?.scrollIntoView();
  }, [isLoading]);

  const { pending, done } = splitTasks(tasks ?? []);
  const total = (tasks ?? []).length;
  const suggested = suggestTaskTemplates(templates ?? [], lead.services ?? []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const titleOf = (id: string | number) => tasks?.find((t) => t.id === id)?.title ?? 'tarefa';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `A mover a tarefa "${titleOf(active.id)}".`,
    onDragOver: ({ active, over }) =>
      over ? `"${titleOf(active.id)}" na posição ${pending.findIndex((t) => t.id === over.id) + 1} de ${pending.length}.` : '',
    onDragEnd: ({ active, over }) =>
      over ? `"${titleOf(active.id)}" largada na posição ${pending.findIndex((t) => t.id === over.id) + 1}.` : 'Movimento cancelado.',
    onDragCancel: () => 'Movimento cancelado.',
  };

  const setLocal = (fn: (list: LeadTask[]) => LeadTask[]) => qc.setQueryData<LeadTask[]>(key, (old) => (old ? fn(old) : old));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      await api(`/leads/${lead.id}/tasks`, { method: 'POST', body: { title: title.trim(), due_on: due || null } });
      setTitle('');
      setDue('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdding(false);
      invalidate(lead.id);
    }
  }

  async function toggle(task: LeadTask, isDone: boolean) {
    setLocal((list) => list.map((t) => (t.id === task.id ? { ...t, done_at: isDone ? new Date().toISOString() : null } : t)));
    if (isDone && pending.length === 1 && pending[0]!.id === task.id && total > 1) toast.success('Todas as tarefas concluídas. 🎉');
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: isDone } });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      invalidate(lead.id);
    }
  }

  async function save(task: LeadTask, patch: { title: string; due_on: string | null }) {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: patch });
      setEditingId(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      invalidate(lead.id);
    }
  }

  async function remove(task: LeadTask) {
    setLocal((list) => list.filter((t) => t.id !== task.id));
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      toast.success('Tarefa apagada.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      invalidate(lead.id);
    }
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = pending.findIndex((t) => t.id === active.id);
    const to = pending.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    const ordered = arrayMove(pending, from, to);
    const positions = new Map(ordered.map((t, i) => [t.id, i + 1]));
    setLocal((list) => list.map((t) => (positions.has(t.id) ? { ...t, position: positions.get(t.id)! } : t)));
    try {
      await api(`/leads/${lead.id}/tasks/reorder`, { method: 'POST', body: { ids: ordered.map((t) => t.id) } });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      invalidate(lead.id);
    }
  }

  async function applyTemplate(template: TaskTemplate) {
    try {
      const { data } = await api<{ data: LeadTask[] }>(`/leads/${lead.id}/tasks/template`, {
        method: 'POST',
        body: { template_id: template.id },
      });
      const added = data.length - total;
      if (added > 0) toast.success(`${added} tarefa${added === 1 ? '' : 's'} de "${template.name}" acrescentada${added === 1 ? '' : 's'}.`);
      else toast.info('Estas tarefas já estão na lista.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      invalidate(lead.id);
    }
  }

  const rowProps = (task: LeadTask, sortable: boolean) => ({
    task,
    today,
    sortable,
    editing: editingId === task.id,
    onToggle: (isDone: boolean) => void toggle(task, isDone),
    onEdit: () => setEditingId(task.id),
    onSave: (patch: { title: string; due_on: string | null }) => save(task, patch),
    onCancelEdit: () => setEditingId(null),
    onDelete: () => void remove(task),
  });

  return (
    <Card id="tarefas" className="scroll-mt-20">
      <CardHeader
        title="Tarefas"
        description={total ? <TaskProgress progress={{ total, done: done.length }} long /> : 'Os próximos passos deste lead ou do projeto.'}
        actions={templates ? <TemplateMenu templates={templates} suggested={suggested} onApply={(t) => void applyTemplate(t)} /> : null}
      />

      <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova tarefa…"
          aria-label="Nova tarefa"
          maxLength={300}
          className="min-w-0 flex-[1_1_10rem]"
        />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Prazo (opcional)" className="w-auto flex-[0_1_9.5rem]" />
        <Button type="submit" size="sm" loading={adding} disabled={!title.trim()}>
          <Plus className="h-4 w-4" aria-hidden />
          Acrescentar
        </Button>
      </form>

      {isLoading ? (
        <Skeleton className="m-3 h-20" />
      ) : loadError ? (
        <p role="alert" className="m-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage(loadError)}
        </p>
      ) : total === 0 ? (
        <div className="p-4 text-sm text-muted">
          <p>Ainda não há tarefas.</p>
          {suggested.length ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-fg">Começar com uma lista pronta para os serviços deste lead:</p>
              <div className="flex flex-wrap gap-2">
                {suggested.map((t) => (
                  <Button key={t.id} size="sm" variant="outline" onClick={() => void applyTemplate(t)}>
                    <ListPlus className="h-3.5 w-3.5" aria-hidden />
                    {t.name} · {t.items.length} tarefas
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {pending.length ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => void onDragEnd(e)}
              accessibility={{
                announcements,
                screenReaderInstructions: {
                  draggable: 'Para mudar a ordem, carrega em Espaço, usa as setas para cima e para baixo e Espaço para largar. Esc cancela.',
                },
              }}
            >
              <SortableContext items={pending.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <ul aria-label="Tarefas por fazer" className="divide-y divide-border py-1">
                  {pending.map((task) => (
                    <TaskRow key={task.id} {...rowProps(task, pending.length > 1)} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">Tudo feito. 🎉</p>
          )}

          {done.length ? (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="flex w-full items-center gap-1.5 px-4 py-2.5 text-sm text-muted hover:text-fg"
              >
                <ChevronRight className={cn('h-4 w-4 transition-transform', showDone && 'rotate-90')} aria-hidden />
                Concluídas ({done.length})
              </button>
              {showDone ? (
                <ul aria-label="Tarefas concluídas" className="divide-y divide-border pb-1">
                  {done.map((task) => (
                    <TaskRow key={task.id} {...rowProps(task, false)} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
