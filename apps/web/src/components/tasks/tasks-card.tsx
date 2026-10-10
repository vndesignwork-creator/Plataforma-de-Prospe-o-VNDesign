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
  addDays,
  formatDate,
  splitTasks,
  suggestTaskTemplates,
  todayIso,
  type Lead,
  type LeadTask,
  type TaskTemplate,
} from '@vndesign/core';
import { Bell, CalendarDays, ChevronRight, GripVertical, ListPlus, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateTasks, useLeadTasks, useTaskTemplates } from '@/lib/queries';
import { Linkified } from '@/lib/linkify';
import { formatReminder, isoToLocalInput, localInputToIso } from '@/lib/local-datetime';
import { cn } from '@/lib/utils';
import { TaskProgress } from './task-progress';

type TaskPatch = { title: string; due_on: string | null; remind_at: string | null };

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

/** 🔔 15/10 10:00 — a laranja enquanto está por avisar; cinzento depois de avisado ou com a tarefa feita. */
export function ReminderChip({ task }: { task: Pick<LeadTask, 'remind_at' | 'reminded_at' | 'done_at'> }) {
  if (!task.remind_at) return null;
  const pending = !task.reminded_at && !task.done_at && new Date(task.remind_at) > new Date();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-xs tabular',
        pending ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-muted',
      )}
      title={pending ? 'Lembrete (notificação)' : 'Lembrete já enviado'}
    >
      <Bell className="h-3 w-3" aria-hidden />
      <span className="sr-only">Lembrete: </span>
      {formatReminder(task.remind_at)}
    </span>
  );
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "Hoje", "Amanhã" ou "15/10" — o texto do botão do prazo. */
export function dueLabel(due: string, today: string): string {
  if (due === today) return 'Hoje';
  if (due === addDays(today, 1)) return 'Amanhã';
  return dayMonth(due);
}

/** Próxima segunda-feira (sempre a seguir a hoje). */
export function nextMonday(today: string): string {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, (8 - dow) % 7 || 7);
}

/** Botão "📅 Prazo" com atalhos (Hoje, Amanhã, Próxima semana) e "Escolher data…". */
function DuePicker({ value, today, onChange, onCustom }: { value: string; today: string; onChange: (v: string) => void; onCustom: () => void }) {
  const options = [
    { label: 'Hoje', date: today },
    { label: 'Amanhã', date: addDays(today, 1) },
    { label: 'Próxima semana', date: nextMonday(today) },
  ];
  return (
    <DropdownRoot>
      <DropdownTrigger
        className={buttonClasses(value ? 'secondary' : 'outline', 'sm', 'min-h-9')}
        aria-label={value ? `Prazo: ${dueLabel(value, today)} (${formatDate(value)})` : 'Prazo (opcional)'}
        title="Prazo: aparece em “Hoje” e nos resumos diários"
      >
        <CalendarDays className="h-4 w-4" aria-hidden />
        {value ? dueLabel(value, today) : 'Prazo'}
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Prazo</DropdownLabel>
        {options.map((o) => (
          <DropdownItem key={o.label} onSelect={() => onChange(o.date)}>
            <span className="flex-1">{o.label}</span>
            <span className="text-xs text-muted tabular">
              {weekday(o.date)} {dayMonth(o.date)}
            </span>
          </DropdownItem>
        ))}
        <DropdownItem onSelect={onCustom}>
          <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
          Escolher data…
        </DropdownItem>
        {value ? (
          <>
            <DropdownSeparator />
            <DropdownItem onSelect={() => onChange('')}>
              <X className="h-4 w-4 text-muted" aria-hidden />
              Sem prazo
            </DropdownItem>
          </>
        ) : null}
      </DropdownContent>
    </DropdownRoot>
  );
}

/** Diz se este dispositivo vai mesmo receber a notificação do lembrete (push ativo) e, se não, onde ativar. */
function PushHint() {
  const [active, setActive] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    (supported ? navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()) : Promise.resolve(null))
      .then((sub) => !cancelled && setActive(!!sub && Notification.permission === 'granted'))
      .catch(() => !cancelled && setActive(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (active === null) return null;
  if (active) {
    return <p className="w-full text-xs text-muted">Recebes uma notificação a essa hora, mesmo com a plataforma fechada.</p>;
  }
  return (
    <p className="w-full rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
      Este dispositivo ainda não tem as notificações ativas — só verás o aviso quando abrires a plataforma.{' '}
      <Link href="/definicoes/lembretes" className="font-medium underline">
        Ativar notificações
      </Link>
    </p>
  );
}

function TaskEditor({
  task,
  onSave,
  onCancel,
}: {
  task: LeadTask;
  onSave: (patch: TaskPatch) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due_on ?? '');
  const [remind, setRemind] = useState(isoToLocalInput(task.remind_at));
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), due_on: due || null, remind_at: localInputToIso(remind) });
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
      <span className="relative inline-flex items-center">
        <Bell className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden />
        <Input
          type="datetime-local"
          value={remind}
          onChange={(e) => setRemind(e.target.value)}
          aria-label="Lembrete (dia e hora)"
          className="w-auto pl-9"
        />
      </span>
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
  onSave: (patch: TaskPatch) => Promise<void>;
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
          {/* Tocar no texto edita; os links do texto abrem (o lápis faz o mesmo, para o teclado). */}
          <span
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('a')) onEdit();
            }}
            className={cn('min-w-0 flex-1 cursor-text text-sm break-words', done && 'text-muted line-through')}
          >
            <Linkified text={task.title} />
            {task.due_on ? (
              <>
                {' '}
                <DueChip due={task.due_on} today={today} done={done} />
              </>
            ) : null}
            {task.remind_at ? (
              <>
                {' '}
                <ReminderChip task={task} />
              </>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 pointer-coarse:opacity-100">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Editar: ${task.title}`}
              className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg pointer-coarse:p-1.5"
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
  const [remind, setRemind] = useState('');
  const [showRemind, setShowRemind] = useState(false);
  const [showDueInput, setShowDueInput] = useState(false);
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
    const value = title.trim();
    if (!value) return;
    // Limpa já, para se poder escrever a seguinte enquanto esta grava (o texto volta se der erro).
    const dueValue = due;
    const remindValue = remind;
    setTitle('');
    setDue('');
    setRemind('');
    setShowRemind(false);
    setShowDueInput(false);
    try {
      await api(`/leads/${lead.id}/tasks`, {
        method: 'POST',
        body: { title: value, due_on: dueValue || null, remind_at: localInputToIso(remindValue) },
      });
      if (remindValue) toast.success(`Lembrete marcado para ${formatReminder(localInputToIso(remindValue)!)}.`);
    } catch (error) {
      toast.error(errorMessage(error));
      setTitle(value);
      setDue(dueValue);
      setRemind(remindValue);
      setShowRemind(Boolean(remindValue));
    } finally {
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

  async function save(task: LeadTask, patch: TaskPatch) {
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
    onSave: (patch: TaskPatch) => save(task, patch),
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
          className="min-w-0 basis-full sm:flex-[1_1_10rem] sm:basis-auto"
        />
        <DuePicker
          value={due}
          today={today}
          onChange={(v) => {
            setDue(v);
            setShowDueInput(false);
          }}
          onCustom={() => setShowDueInput(true)}
        />
        <Button
          type="button"
          size="icon"
          variant={showRemind ? 'secondary' : 'outline'}
          aria-pressed={showRemind}
          aria-label="Lembrete com notificação"
          title="Lembrete com notificação"
          onClick={() => setShowRemind((v) => !v)}
        >
          <Bell className="h-4 w-4" aria-hidden />
        </Button>
        {/* Sem "a carregar": o Enter tem de continuar a funcionar enquanto a anterior grava. */}
        <Button type="submit" size="sm" disabled={!title.trim()} className="max-sm:ml-auto">
          <Plus className="h-4 w-4" aria-hidden />
          {/* Em ecrãs muito estreitos fica só o "+", para caber na mesma linha que o prazo e o lembrete. */}
          <span className="max-[380px]:sr-only">Acrescentar</span>
        </Button>
        {showDueInput ? (
          <div className="flex w-full flex-wrap items-center gap-2 text-sm">
            <label htmlFor={`due-${lead.id}`} className="text-muted">
              Prazo
            </label>
            <Input
              id={`due-${lead.id}`}
              type="date"
              value={due}
              min={today}
              autoFocus
              onChange={(e) => setDue(e.target.value)}
              className="w-auto"
            />
            <p className="w-full text-xs text-muted">Com prazo, a tarefa aparece em “Hoje” no dashboard e nos resumos diários.</p>
          </div>
        ) : null}
        {showRemind ? (
          <div className="flex w-full flex-wrap items-center gap-2 text-sm">
            <label htmlFor={`remind-${lead.id}`} className="text-muted">
              Lembrar em
            </label>
            <Input
              id={`remind-${lead.id}`}
              type="datetime-local"
              value={remind}
              onChange={(e) => setRemind(e.target.value)}
              className="w-auto"
            />
            <PushHint />
          </div>
        ) : null}
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
