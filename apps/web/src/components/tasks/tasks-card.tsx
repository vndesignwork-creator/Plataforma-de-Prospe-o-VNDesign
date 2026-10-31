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
  formatDuration,
  splitTasks,
  suggestTaskTemplates,
  todayIso,
  type Lead,
  type LeadTask,
  type TaskTemplate,
} from '@vndesign/core';
import { Bell, CalendarDays, Check, ChevronRight, Clock, Copy, CopyPlus, GripVertical, ListPlus, MoreVertical, Pencil, Plus, UserRound, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { DateInput, DateTimeInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateTasks, useLeadTasks, useMe, useTaskTemplates, useTeamNames } from '@/lib/queries';
import { Linkified } from '@/lib/linkify';
import { formatReminder, isoToLocalInput, localInputToIso } from '@/lib/local-datetime';
import { verticalOnly } from '@/lib/dnd';
import { cn } from '@/lib/utils';
import { DueChip, ReminderChip } from './task-chips';
import { TaskProgress } from './task-progress';

type TaskPatch = { title: string; due_on: string | null; remind_at: string | null; assigned_to?: string | null };

// Os selos de prazo e lembrete estão num ficheiro à parte (o Dashboard usa-os sem
// trazer o cartão inteiro, com o arrastar e largar).
export { DueChip, ReminderChip };

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
export function DuePicker({
  value,
  today,
  onChange,
  onCustom,
  task,
  compact,
}: {
  value: string;
  today: string;
  onChange: (v: string) => void;
  onCustom: () => void;
  /** Título da tarefa (para o nome do botão, quando há vários na página). */
  task?: string;
  /** Com prazo, só o ícone (a data já está à vista ao lado). */
  compact?: boolean;
}) {
  const options = [
    { label: 'Hoje', date: today },
    { label: 'Amanhã', date: addDays(today, 1) },
    { label: 'Próxima semana', date: nextMonday(today) },
  ];
  return (
    <DropdownRoot>
      <DropdownTrigger
        className={buttonClasses(value ? 'secondary' : 'outline', 'sm', cn('min-h-9', compact && value && 'w-9 px-0'))}
        aria-label={`${task ? `Prazo de ${task}` : 'Prazo'}${value ? `: ${dueLabel(value, today)} (${formatDate(value)})` : task ? '' : ' (opcional)'}`}
        title="Prazo: aparece em “Hoje” e nos resumos diários"
      >
        <CalendarDays className="h-4 w-4" aria-hidden />
        {compact && value ? null : value ? dueLabel(value, today) : 'Prazo'}
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

/** Editar uma tarefa numa janela: o texto todo à vista (várias linhas), prazo e lembrete. */
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
  const [assignee, setAssignee] = useState(task.assigned_to ?? '');
  const { data: team } = useTeamNames();
  const { data: me } = useMe();
  const [saving, setSaving] = useState(false);
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.replace(/\s*\n\s*/g, '\n').trim(),
      due_on: due || null,
      remind_at: localInputToIso(remind),
      ...(assignee !== (task.assigned_to ?? '') ? { assigned_to: assignee || null } : {}),
    });
    setSaving(false);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => (!open ? onCancel() : undefined)}
      title="Editar tarefa"
      className="max-w-xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" form={`task-edit-${task.id}`} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={`task-edit-${task.id}`} onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor={`task-title-${task.id}`} className="mb-1.5 block text-sm font-medium">
            Texto da tarefa
          </label>
          <Textarea
            id={`task-title-${task.id}`}
            value={title}
            maxLength={300}
            rows={3}
            // A caixa cresce com o texto (todo à vista, também no telemóvel): o ref corre a cada render.
            ref={(el) => {
              if (!el) return;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
            }}
            onChange={(e) => setTitle(e.target.value)}
            // Enter guarda (como antes); Shift+Enter muda de linha.
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            className="leading-relaxed"
          />
          <p className="mt-1 text-right text-xs text-muted tabular">{title.length}/300</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`task-due-${task.id}`} className="mb-1.5 block text-sm font-medium">
              Prazo
            </label>
            <DateInput id={`task-due-${task.id}`} value={due} onChange={setDue} aria-label="Prazo da tarefa" />
          </div>
          <div>
            <label htmlFor={`task-remind-${task.id}`} className="mb-1.5 block text-sm font-medium">
              Lembrete
            </label>
            <DateTimeInput id={`task-remind-${task.id}`} value={remind} onChange={setRemind} aria-label="Lembrete (dia e hora)" placeholder="🔔 dia e hora" />
          </div>
        </div>
        {/* Com equipa: a quem fica a tarefa (essa pessoa recebe um aviso). */}
        {(team?.length ?? 0) > 1 ? (
          <div>
            <label htmlFor={`task-assignee-${task.id}`} className="mb-1.5 block text-sm font-medium">
              Responsável
            </label>
            <Select id={`task-assignee-${task.id}`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Ninguém</option>
              {(team ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                  {m.user_id === me?.user.id ? ' (tu)' : ''}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">Recebe um aviso e vê-a em Tarefas → As minhas.</p>
          </div>
        ) : null}
      </form>
    </Dialog>
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
  onDuplicate,
  onDelete,
  assigneeName,
}: {
  task: LeadTask;
  assigneeName?: string | null;
  today: string;
  editing: boolean;
  sortable: boolean;
  onToggle: (done: boolean) => Promise<boolean>;
  onEdit: () => void;
  onSave: (patch: TaskPatch) => Promise<void>;
  onCancelEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !sortable || editing,
  });
  const done = Boolean(task.done_at);
  // Ao concluir: grava logo; o visto e o risco veem-se enquanto a tarefa não passa para "Concluídas".
  const [completing, setCompleting] = useState(false);
  const shownDone = done || completing;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group relative flex items-start gap-1.5 px-2 py-2 transition-opacity duration-300 hover:bg-surface-2 sm:gap-2 sm:px-3',
        isDragging && 'z-10 bg-surface-2 opacity-80 shadow-card',
        completing && 'opacity-50',
      )}
    >
      {sortable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-roledescription="tarefa arrastável"
          aria-label={`Mover a tarefa: ${task.title}`}
          className="-my-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-3 hover:text-fg"
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      <input
        type="checkbox"
        checked={shownDone}
        disabled={completing}
        onChange={(e) => {
          if (e.target.checked && !done) setCompleting(true);
          // Se não gravar (ex.: sem internet), o visto volta atrás.
          void onToggle(e.target.checked).then((ok) => {
            if (!ok) setCompleting(false);
          });
        }}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer transition-transform checked:scale-110"
      />
      {editing ? <TaskEditor task={task} onSave={onSave} onCancel={onCancelEdit} /> : null}
      {/* Tocar no texto edita; os links do texto abrem (com o teclado: Tab até ao lápis). */}
      <span
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a')) onEdit();
        }}
        className={cn('min-w-0 flex-1 cursor-text text-sm break-words whitespace-pre-line transition-colors', shownDone && 'text-muted line-through')}
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
        {assigneeName ? (
          <>
            {' '}
            <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 text-xs whitespace-nowrap text-muted" title="Responsável">
              <UserRound className="h-3 w-3" aria-hidden />
              <span className="sr-only">Responsável: </span>
              {assigneeName}
            </span>
          </>
        ) : null}
        {task.time_seconds && task.time_seconds >= 60 ? (
          <>
            {' '}
            <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted tabular" title="Tempo registado nesta tarefa">
              <Clock className="h-3 w-3" aria-hidden />
              <span className="sr-only">Tempo registado: </span>
              {formatDuration(task.time_seconds)}
            </span>
          </>
        ) : null}
      </span>
      {/* Editar: toca-se no texto. O lápis só aparece com o teclado (Tab). */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar: ${task.title}`}
        className="sr-only text-muted focus-visible:not-sr-only focus-visible:shrink-0 focus-visible:rounded focus-visible:p-1"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
      {/* Computador: os ícones aparecem ao passar o rato. */}
      <span className="hidden shrink-0 items-center gap-0.5 sm:flex sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 pointer-coarse:opacity-100">
        <button
          type="button"
          onClick={() => void copyText(task.title)}
          aria-label={`Copiar o texto: ${task.title}`}
          title="Copiar o texto"
          className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg pointer-coarse:p-1.5"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          aria-label={`Duplicar: ${task.title}`}
          title="Duplicar"
          className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg pointer-coarse:p-1.5"
        >
          <CopyPlus className="h-3.5 w-3.5" aria-hidden />
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
      {/* Telemóvel: um só botão "⋯" (o texto fica com a largura toda). */}
      <DropdownRoot>
        <DropdownTrigger aria-label={`Mais ações: ${task.title}`} className="-my-0.5 shrink-0 rounded p-1.5 text-muted hover:bg-surface-3 hover:text-fg sm:hidden">
          <MoreVertical className="h-4 w-4" aria-hidden />
        </DropdownTrigger>
        <DropdownContent align="end">
          <DropdownItem onSelect={() => void copyText(task.title)}>
            <Copy className="h-4 w-4" aria-hidden /> Copiar o texto
          </DropdownItem>
          <DropdownItem onSelect={onDuplicate}>
            <CopyPlus className="h-4 w-4" aria-hidden /> Duplicar
          </DropdownItem>
          <DropdownItem danger onSelect={onDelete}>
            <X className="h-4 w-4" aria-hidden /> Apagar
          </DropdownItem>
        </DropdownContent>
      </DropdownRoot>
    </li>
  );
}

/** Copia o texto da tarefa (para colar num email, no WhatsApp…). */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Texto copiado.');
  } catch {
    toast.error('Não foi possível copiar. Seleciona o texto e usa Ctrl+C.');
  }
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

/**
 * Cartão "Tarefas" da ficha: lista com caixas, por ordem (arrastar), prazos e
 * listas prontas por serviço. `embedded`: só o campo e a lista, sem o cartão
 * (ex.: dentro de cada projeto na página Projetos).
 */
const NEXT_TASKS = 5;

export function TasksCard({ lead, embedded }: { lead: Lead; embedded?: boolean }) {
  const today = todayIso();
  const qc = useQueryClient();
  const key = ['tasks', lead.id];
  const invalidate = useInvalidateTasks();
  const { data: tasks, isLoading, error: loadError } = useLeadTasks(lead.id);
  const { data: templates } = useTaskTemplates();
  const { data: team } = useTeamNames();
  const { data: me } = useMe();
  const hasTeam = (team?.length ?? 0) > 1;
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [remind, setRemind] = useState('');
  const [showRemind, setShowRemind] = useState(false);
  const [showDueInput, setShowDueInput] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  // Na coluna lateral: as 5 próximas por fazer (todas com "Ver todas" ou vindo de um link para as tarefas).
  const [showAll, setShowAll] = useState(false);

  // Ao abrir a ficha por um link para as tarefas (ex.: "Criar tarefas" no Kanban), descer até aqui
  // quando a lista já tem altura (o browser tentou antes de o cartão existir).
  useEffect(() => {
    if (!isLoading && window.location.hash === '#tarefas') {
      // Vindo de um link para as tarefas: todas à vista (a que se procura pode não estar nas 5 primeiras).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- só no browser (o endereço)
      setShowAll(true);
      document.getElementById('tarefas')?.scrollIntoView();
    }
  }, [isLoading]);

  const { pending, done } = splitTasks(tasks ?? []);
  const total = (tasks ?? []).length;
  const shownPending = embedded || showAll ? pending : pending.slice(0, NEXT_TASKS);
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

  /** Concluir/reabrir. Concluir: grava já e a tarefa só muda de lugar depois de se ver o visto (meio segundo). */
  async function toggle(task: LeadTask, isDone: boolean): Promise<boolean> {
    const move = () => setLocal((list) => list.map((t) => (t.id === task.id ? { ...t, done_at: isDone ? new Date().toISOString() : null } : t)));
    if (!isDone) move();
    const request = api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: isDone } });
    try {
      if (isDone) {
        await Promise.all([request, new Promise((r) => setTimeout(r, 450))]);
        move();
        if (pending.length === 1 && pending[0]!.id === task.id && total > 1) toast.success('Todas as tarefas concluídas. 🎉');
        else {
          toast.success(`Concluída: ${task.title.length > 60 ? `${task.title.slice(0, 60)}…` : task.title}`, {
            action: { label: 'Anular', onClick: () => void toggle(task, false) },
          });
        }
      } else await request;
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
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

  /** Cópia logo a seguir à original (mesmo texto e prazo; o lembrete não, que já passou ou ficava repetido), com "Anular". */
  async function duplicate(task: LeadTask) {
    try {
      const { data: copy } = await api<{ data: LeadTask }>(`/leads/${lead.id}/tasks`, {
        method: 'POST',
        body: { title: task.title, due_on: task.due_on, assigned_to: task.assigned_to ?? null },
      });
      // As novas entram em cima: a cópia passa para logo a seguir à original.
      const at = pending.findIndex((t) => t.id === task.id);
      if (at >= 0) {
        const ids = pending.map((t) => t.id);
        ids.splice(at + 1, 0, copy.id);
        await api(`/leads/${lead.id}/tasks/reorder`, { method: 'POST', body: { ids } });
      }
      toast.success('Tarefa duplicada.', {
        action: {
          label: 'Anular',
          onClick: () =>
            void api(`/tasks/${copy.id}`, { method: 'DELETE' })
              .catch((error) => toast.error(errorMessage(error)))
              .finally(() => invalidate(lead.id)),
        },
      });
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
    assigneeName: task.assigned_to && hasTeam ? (task.assigned_to === me?.user.id ? 'Tu' : (team?.find((m) => m.user_id === task.assigned_to)?.name ?? null)) : null,
    today,
    sortable,
    editing: editingId === task.id,
    onToggle: (isDone: boolean) => toggle(task, isDone),
    onEdit: () => setEditingId(task.id),
    onSave: (patch: TaskPatch) => save(task, patch),
    onCancelEdit: () => setEditingId(null),
    onDuplicate: () => void duplicate(task),
    onDelete: () => void remove(task),
  });

  const content = (
    <>
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
            <DateInput
              id={`due-${lead.id}`}
              value={due}
              min={today}
              autoFocus
              onChange={setDue}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowDueInput(false);
                }
              }}
              className="w-40"
            />
            {/* Fecha só o calendário: a data escolhida fica no botão "Prazo" (para tirar: Prazo → Sem prazo). */}
            <Button type="button" size="sm" variant={due ? 'secondary' : 'ghost'} onClick={() => setShowDueInput(false)}>
              {due ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
              {due ? 'OK' : 'Fechar'}
            </Button>
            <p className="w-full text-xs text-muted">Com prazo, a tarefa aparece em “Hoje” no dashboard e nos resumos diários.</p>
          </div>
        ) : null}
        {showRemind ? (
          <div className="flex w-full flex-wrap items-center gap-2 text-sm">
            <label htmlFor={`remind-${lead.id}`} className="text-muted">
              Lembrar em
            </label>
            <DateTimeInput id={`remind-${lead.id}`} value={remind} onChange={setRemind} className="w-52" />
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
              modifiers={[verticalOnly]}
              collisionDetection={closestCenter}
              onDragEnd={(e) => void onDragEnd(e)}
              accessibility={{
                announcements,
                screenReaderInstructions: {
                  draggable: 'Para mudar a ordem, carrega em Espaço, usa as setas para cima e para baixo e Espaço para largar. Esc cancela.',
                },
              }}
            >
              <SortableContext items={shownPending.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <ul aria-label="Tarefas por fazer" className="divide-y divide-border py-1">
                  {shownPending.map((task) => (
                    <TaskRow key={task.id} {...rowProps(task, pending.length > 1)} />
                  ))}
                </ul>
              </SortableContext>
              {pending.length > shownPending.length || (showAll && !embedded && pending.length > NEXT_TASKS) ? (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  aria-expanded={showAll}
                  className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2 text-sm text-accent-text hover:underline"
                >
                  <ChevronRight className={cn('h-4 w-4 transition-transform', showAll && '-rotate-90')} aria-hidden />
                  {showAll ? 'Mostrar só as próximas' : `Ver todas (${pending.length})`}
                </button>
              ) : null}
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
    </>
  );

  if (embedded) return <div className="overflow-hidden rounded-lg border border-border">{content}</div>;
  return (
    <Card id="tarefas" className="scroll-mt-20">
      {/* Título e "Usar lista" na mesma linha (também no telemóvel); o progresso fica por baixo, a toda a largura. */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Tarefas</h2>
          {templates ? <TemplateMenu templates={templates} suggested={suggested} onApply={(t) => void applyTemplate(t)} /> : null}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {total ? <TaskProgress progress={{ total, done: done.length }} long /> : 'Os próximos passos deste lead ou do projeto.'}
        </p>
      </div>

      {content}
    </Card>
  );
}
