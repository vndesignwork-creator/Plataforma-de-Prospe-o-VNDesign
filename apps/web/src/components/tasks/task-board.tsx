"use client";

/**
 * Tarefas em cartões (como as listas do Google Keep): cada lista tem um título e as
 * suas tarefas; cada lead/projeto com tarefas tem o seu cartão; as soltas sem lista
 * ficam em "Sem lista". Em cada cartão: escrever e Enter cria a tarefa, arrastar muda
 * a ordem, e cada tarefa tem copiar, duplicar, mover para outro cartão e apagar.
 */
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TASK_TITLE_MAX,
  leadPath,
  parseTaskPhrase,
  type LeadTask,
  type TaskList,
  type TaskListItem,
} from "@vndesign/core";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  BriefcaseBusiness,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { DictateButton } from "@/components/ui/dictate-button";
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input, Textarea } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import { verticalOnly } from "@/lib/dnd";
import {
  useInvalidateTasks,
  usePreference,
  useSetPreference,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  TaskRow,
  copyText,
  type MoveTarget,
  type TaskPatch,
} from "./tasks-card";

/** Onde vive a tarefa: um lead/projeto, uma lista ou as soltas sem lista. */
type Container =
  | { kind: "lead"; leadId: string }
  | { kind: "list"; listId: string }
  | { kind: "loose" };
type BoardCard = {
  key: string;
  container: Container;
  title: string;
  lead?: NonNullable<TaskListItem["lead"]>;
  list?: TaskList;
  pending: TaskListItem[];
  done: TaskListItem[];
};

const keyOf = (t: Pick<TaskListItem, "lead_id" | "list_id">) =>
  t.lead_id ? `lead:${t.lead_id}` : t.list_id ? `list:${t.list_id}` : "loose";
const byPosition = (a: LeadTask, b: LeadTask) =>
  a.position - b.position || b.created_at.localeCompare(a.created_at);
const containerBody = (c: Container) =>
  c.kind === "lead"
    ? { lead_id: c.leadId, list_id: null }
    : c.kind === "list"
      ? { lead_id: null, list_id: c.listId }
      : { lead_id: null, list_id: null };

const BOARD_ORDER_KEY = "tasks.board.order";

export function useTaskLists() {
  return useQuery({
    queryKey: ["task-lists"],
    queryFn: () => api<{ data: TaskList[] }>("/task-lists").then((r) => r.data),
  });
}

/** "Nova lista": título e as primeiras tarefas (uma por linha), como uma nota do Keep. */
function NewListComposer({ assignTo }: { assignTo: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e?: FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { data: list } = await api<{ data: TaskList }>("/task-lists", {
        method: "POST",
        body: {
          title: title.trim(),
          items: items
            .split("\n")
            .map((l) => l.replace(/^\s*[-•*☐□]\s*/, "").trim())
            .filter(Boolean),
          // Com equipa ("as minhas"): as tarefas da lista nova ficam com quem a criou.
          assigned_to: assignTo,
        },
      });
      toast.success(`Lista “${list.title}” criada.`);
      setTitle("");
      setItems("");
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["task-lists"] });
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm text-muted shadow-card hover:text-fg sm:max-w-xl"
      >
        <Plus className="h-4 w-4" aria-hidden /> Criar uma lista…
      </button>
    );
  }
  return (
    <form
      onSubmit={create}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-card sm:max-w-xl"
      aria-label="Nova lista"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título (ex.: Compras do escritório)"
        aria-label="Título da lista"
        maxLength={120}
        autoFocus
      />
      <Textarea
        value={items}
        onChange={(e) => setItems(e.target.value)}
        rows={4}
        placeholder={
          "Uma tarefa por linha\nEx.: Renovar o domínio\nAtualizar o portefólio"
        }
        aria-label="Tarefas da lista (uma por linha)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <DictateButton size="sm" value={items} onChange={setItems} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
          Criar lista
        </Button>
      </div>
    </form>
  );
}

function CardTitle({
  card,
  onRename,
}: {
  card: BoardCard;
  onRename: (title: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(card.title);
  if (card.lead) {
    const Icon = card.lead.status === "cliente" ? BriefcaseBusiness : Users;
    return (
      <Link
        href={`${leadPath(card.lead)}#tarefas`}
        className="flex min-w-0 flex-1 items-start gap-1.5 font-semibold hover:underline"
      >
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            card.lead.status === "cliente" ? "text-success" : "text-info",
          )}
          aria-hidden
        />
        <span className="min-w-0 break-words">
          #{card.lead.number} {card.lead.company_name}
          {card.lead.project_title ? (
            <span className="font-normal text-muted">
              {" "}
              · {card.lead.project_title}
            </span>
          ) : null}
        </span>
      </Link>
    );
  }
  if (!card.list) {
    return (
      <h2 className="flex flex-1 items-center gap-1.5 font-semibold">
        <CircleDot className="h-4 w-4 text-muted" aria-hidden /> {card.title}
      </h2>
    );
  }
  if (editing) {
    return (
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && value.trim() !== card.title)
            void onRename(value.trim());
          setEditing(false);
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value.trim() && value.trim() !== card.title)
              void onRename(value.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          maxLength={120}
          aria-label="Título da lista"
          className="h-8 font-semibold"
          autoFocus
        />
      </form>
    );
  }
  return (
    <h2
      className="min-w-0 flex-1 cursor-text font-semibold break-words"
      onClick={() => setEditing(true)}
      title="Tocar para mudar o título"
    >
      {card.title}
    </h2>
  );
}

type CardMove = "first" | "up" | "down" | "last";

function BoardCardView({
  card,
  today,
  targets,
  assigneeName,
  assignTo,
  index,
  count,
  onMoveCard,
}: {
  index: number;
  count: number;
  onMoveCard: (move: CardMove) => void;
  card: BoardCard;
  today: string;
  targets: { key: string; label: string; container: Container }[];
  assigneeName: (id: string | null | undefined) => string | null;
  assignTo: string | null;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const invalidate = useInvalidateTasks();
  // O cartão muda de lugar pela pega do título (o arrastar das tarefas tem o seu próprio contexto, mais abaixo).
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
    isOver,
  } = useSortable({ id: card.key });
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  // Ordem depois de arrastar (até a lista voltar do servidor).
  const [order, setOrder] = useState<string[] | null>(null);
  const pending = order
    ? order
        .map((id) => card.pending.find((t) => t.id === id))
        .filter((t): t is TaskListItem => !!t)
    : card.pending;
  const refresh = (
    leadId: string | null = card.container.kind === "lead"
      ? card.container.leadId
      : null,
  ) => {
    invalidate(leadId);
    void qc.invalidateQueries({ queryKey: ["task-lists"] });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function add(e: FormEvent) {
    e.preventDefault();
    const typed = title.trim();
    if (!typed) return;
    const phrase = parseTaskPhrase(typed, today);
    setTitle("");
    try {
      await api("/tasks", {
        method: "POST",
        body: {
          ...containerBody(card.container),
          title: phrase.matched.length ? phrase.title : typed,
          due_on: phrase.due_on,
          remind_at:
            phrase.time && phrase.due_on
              ? new Date(`${phrase.due_on}T${phrase.time}:00`).toISOString()
              : null,
          ...(assignTo ? { assigned_to: assignTo } : {}),
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
      setTitle(typed);
    } finally {
      setOrder(null);
      refresh();
    }
  }

  async function toggle(task: TaskListItem, done: boolean): Promise<boolean> {
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: { done } });
      if (done) {
        await new Promise((r) => setTimeout(r, 450));
        toast.success(
          `Concluída: ${task.title.length > 60 ? `${task.title.slice(0, 60)}…` : task.title}`,
          {
            action: {
              label: "Anular",
              onClick: () => void toggle(task, false),
            },
          },
        );
      }
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      refresh(task.lead_id);
    }
  }

  async function save(task: TaskListItem, patch: TaskPatch) {
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: patch });
      setEditingId(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      refresh(task.lead_id);
    }
  }

  async function remove(task: TaskListItem) {
    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      toast.success("Tarefa apagada.", {
        action: {
          label: "Anular",
          onClick: () =>
            void api("/tasks", {
              method: "POST",
              body: {
                ...containerBody(card.container),
                title: task.title,
                due_on: task.due_on,
                assigned_to: task.assigned_to ?? null,
              },
            })
              .catch((error) => toast.error(errorMessage(error)))
              .finally(() => refresh(task.lead_id)),
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setOrder(null);
      refresh(task.lead_id);
    }
  }

  async function duplicate(task: TaskListItem) {
    try {
      const { data: copy } = await api<{ data: LeadTask }>("/tasks", {
        method: "POST",
        body: {
          ...containerBody(card.container),
          title: task.title,
          due_on: task.due_on,
          assigned_to: task.assigned_to ?? null,
        },
      });
      // A cópia fica logo a seguir à original.
      const ids = pending.map((t) => t.id);
      const at = ids.indexOf(task.id);
      if (at >= 0) {
        ids.splice(at + 1, 0, copy.id);
        await api("/tasks/reorder", { method: "POST", body: { ids } });
      }
      toast.success("Tarefa duplicada.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setOrder(null);
      refresh(task.lead_id);
    }
  }

  async function move(
    task: TaskListItem,
    to: { label: string; container: Container },
  ) {
    try {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: containerBody(to.container),
      });
      toast.success(`Movida para “${to.label}”.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setOrder(null);
      refresh(task.lead_id);
      if (to.container.kind === "lead") invalidate(to.container.leadId);
    }
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = pending.findIndex((t) => t.id === active.id);
    const to = pending.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    const ids = arrayMove(pending, from, to).map((t) => t.id);
    setOrder(ids);
    try {
      await api("/tasks/reorder", { method: "POST", body: { ids } });
    } catch (error) {
      toast.error(errorMessage(error));
      setOrder(null);
    } finally {
      refresh();
    }
  }

  async function renameList(next: string) {
    if (!card.list) return;
    try {
      await api(`/task-lists/${card.list.id}`, {
        method: "PATCH",
        body: { title: next },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      void qc.invalidateQueries({ queryKey: ["task-lists"] });
    }
  }

  async function deleteList() {
    if (!card.list) return;
    const n = card.pending.length + card.done.length;
    if (
      n &&
      !window.confirm(
        `Apagar a lista “${card.title}” e as ${n} tarefa${n === 1 ? "" : "s"} dela?`,
      )
    )
      return;
    try {
      await api(`/task-lists/${card.list.id}`, { method: "DELETE" });
      toast.success("Lista apagada.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      refresh(null);
    }
  }

  const rowProps = (task: TaskListItem, sortable: boolean) => ({
    task,
    today,
    sortable,
    assigneeName: assigneeName(task.assigned_to),
    editing: editingId === task.id,
    onToggle: (done: boolean) => toggle(task, done),
    onEdit: () => setEditingId(task.id),
    onSave: (patch: TaskPatch) => save(task, patch),
    onCancelEdit: () => setEditingId(null),
    onDuplicate: () => void duplicate(task),
    onDelete: () => void remove(task),
    moveTargets: targets
      .filter((t) => t.key !== card.key)
      .map(
        (t): MoveTarget => ({
          key: t.key,
          label: t.label,
          onSelect: () => void move(task, t),
        }),
      ),
  });

  const allText = [
    card.title,
    ...pending.map((t) => `☐ ${t.title}`),
    ...card.done.map((t) => `☑ ${t.title}`),
  ].join("\n");
  return (
    <div ref={setNodeRef} className="mb-4 break-inside-avoid">
      <Card
        role="region"
        className={cn(
          "overflow-hidden",
          isDragging && "opacity-40",
          isOver && !isDragging && "ring-2 ring-accent",
        )}
        aria-label={card.title}
      >
        <div className="flex items-start gap-2 px-4 pt-3 pb-2 text-sm">
          {count > 1 ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-roledescription="cartão arrastável"
              aria-label={`Mudar de lugar o cartão: ${card.title}`}
              title="Arrastar para mudar o cartão de lugar"
              className="-my-0.5 -ml-2 shrink-0 cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-3 hover:text-fg"
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <CardTitle card={card} onRename={renameList} />
          <DropdownRoot>
            <DropdownTrigger
              aria-label={`Mais ações: ${card.title}`}
              className="-mt-1 -mr-2 shrink-0 rounded p-1.5 text-muted hover:bg-surface-3 hover:text-fg"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </DropdownTrigger>
            <DropdownContent>
              {card.lead ? (
                <DropdownItem
                  onSelect={() =>
                    router.push(`${leadPath(card.lead!)}#tarefas`)
                  }
                >
                  <ExternalLink className="h-4 w-4" aria-hidden /> Abrir a ficha
                </DropdownItem>
              ) : null}
              <DropdownItem onSelect={() => void copyText(allText)}>
                <Copy className="h-4 w-4" aria-hidden /> Copiar a lista
              </DropdownItem>
              {count > 1 ? (
                <>
                  <DropdownSeparator />
                  <DropdownItem
                    disabled={index === 0}
                    onSelect={() => onMoveCard("first")}
                  >
                    <ArrowUpToLine className="h-4 w-4" aria-hidden /> Mover para
                    o início
                  </DropdownItem>
                  <DropdownItem
                    disabled={index === 0}
                    onSelect={() => onMoveCard("up")}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden /> Mover para antes
                  </DropdownItem>
                  <DropdownItem
                    disabled={index === count - 1}
                    onSelect={() => onMoveCard("down")}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden /> Mover para
                    depois
                  </DropdownItem>
                  <DropdownItem
                    disabled={index === count - 1}
                    onSelect={() => onMoveCard("last")}
                  >
                    <ArrowDownToLine className="h-4 w-4" aria-hidden /> Mover
                    para o fim
                  </DropdownItem>
                </>
              ) : null}
              {card.list ? (
                <>
                  <DropdownSeparator />
                  <DropdownItem danger onSelect={() => void deleteList()}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Apagar a lista
                  </DropdownItem>
                </>
              ) : null}
            </DropdownContent>
          </DropdownRoot>
        </div>
        {/* Escrever e Enter: a tarefa entra em cima (aceita "sexta às 10h"). */}
        <form
          onSubmit={add}
          className="flex flex-wrap items-center gap-1.5 border-y border-border px-2 py-1.5"
        >
          <Plus className="ml-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nova tarefa…"
            aria-label={`Nova tarefa em ${card.title}`}
            maxLength={TASK_TITLE_MAX}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 focus:ring-0"
          />
          <DictateButton
            size="sm"
            value={title}
            onChange={setTitle}
            max={TASK_TITLE_MAX}
            className="border-0"
          />
        </form>
        {pending.length ? (
          <DndContext
            sensors={sensors}
            modifiers={[verticalOnly]}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <SortableContext
              items={pending.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul
                aria-label={`Tarefas por fazer: ${card.title}`}
                className="divide-y divide-border py-1"
              >
                {pending.map((task) => (
                  <TaskRow
                    key={task.id}
                    {...rowProps(task, pending.length > 1)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">
            {card.done.length ? "Tudo feito. 🎉" : "Sem tarefas por fazer."}
          </p>
        )}
        {card.done.length ? (
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex w-full items-center gap-1.5 px-4 py-2 text-sm text-muted hover:text-fg"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform",
                  showDone && "rotate-90",
                )}
                aria-hidden
              />
              Concluídas ({card.done.length})
            </button>
            {showDone ? (
              <ul
                aria-label={`Concluídas: ${card.title}`}
                className="divide-y divide-border pb-1"
              >
                {card.done.map((task) => (
                  <TaskRow key={task.id} {...rowProps(task, false)} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/**
 * O quadro: a caixa "Criar uma lista…", as listas, as soltas sem lista e um cartão por
 * lead/projeto com tarefas. `pending`/`done` já vêm filtrados (pesquisa, pessoa, tipo).
 */
export function TaskBoard({
  pending,
  done,
  today,
  showLists,
  showLeads,
  query,
  assigneeName,
  assignTo,
  loading,
  empty,
}: {
  pending: TaskListItem[];
  done: TaskListItem[];
  today: string;
  /** Tipo "Leads"/"Projetos": sem as listas nem as soltas. */
  showLists: boolean;
  /** Tipo "Sem lead": sem os cartões dos leads. */
  showLeads: boolean;
  /** Pesquisa: as listas vazias (ou que não batem) ficam de fora. */
  query: string;
  assigneeName: (id: string | null | undefined) => string | null;
  assignTo: string | null;
  loading: boolean;
  empty: ReactNode;
}) {
  const { data: lists, isLoading: listsLoading } = useTaskLists();
  const cards = useMemo(() => {
    const byKey = new Map<string, BoardCard>();
    if (showLists) {
      for (const list of lists ?? []) {
        byKey.set(`list:${list.id}`, {
          key: `list:${list.id}`,
          container: { kind: "list", listId: list.id },
          title: list.title,
          list,
          pending: [],
          done: [],
        });
      }
    }
    const place = (t: TaskListItem, done: boolean) => {
      const key = keyOf(t);
      let card = byKey.get(key);
      if (!card) {
        if (t.lead) {
          if (!showLeads || done) return;
          card = {
            key,
            container: { kind: "lead", leadId: t.lead.id },
            title: `#${t.lead.number} ${t.lead.company_name}`,
            lead: t.lead,
            pending: [],
            done: [],
          };
        } else if (key === "loose") {
          if (!showLists) return;
          card = {
            key,
            container: { kind: "loose" },
            title: "Sem lista",
            pending: [],
            done: [],
          };
        } else return; // lista que já não existe (ou de outra pessoa)
        byKey.set(key, card);
      }
      (done ? card.done : card.pending).push(t);
    };
    for (const t of pending) place(t, false);
    for (const t of done) place(t, true);
    const all = [...byKey.values()];
    for (const c of all) c.pending.sort(byPosition);
    const q = query.trim().toLowerCase();
    const visible = q
      ? all.filter(
          (c) =>
            c.pending.length ||
            c.done.length ||
            c.title.toLowerCase().includes(q),
        )
      : all;
    // Listas (pela ordem delas), depois "Sem lista", depois os leads pelo prazo mais próximo.
    const firstDue = (c: BoardCard) =>
      c.pending.map((t) => t.due_on ?? "9999-12-31").sort()[0] ?? "9999-12-31";
    const rank = (c: BoardCard) =>
      c.list ? 0 : c.container.kind === "loose" ? 1 : 2;
    return visible.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.list && b.list ? a.list.position - b.list.position : 0) ||
        firstDue(a).localeCompare(firstDue(b)),
    );
  }, [lists, pending, done, showLists, showLeads, query]);

  const targets = useMemo(() => {
    const items: { key: string; label: string; container: Container }[] = (
      lists ?? []
    ).map((l) => ({
      key: `list:${l.id}`,
      label: l.title,
      container: { kind: "list" as const, listId: l.id },
    }));
    items.push({
      key: "loose",
      label: "Sem lista",
      container: { kind: "loose" },
    });
    for (const c of cards)
      if (c.lead)
        items.push({ key: c.key, label: c.title, container: c.container });
    return items;
  }, [lists, cards]);

  // A ordem dos cartões é de cada pessoa (preferência). Os que ainda não estão nela (ex.: lista nova) vêm primeiro.
  const { data: savedOrder } = usePreference<{ order?: string[] }>(
    BOARD_ORDER_KEY,
  );
  const saveOrder = useSetPreference<{ order: string[] }>(BOARD_ORDER_KEY);
  const ordered = useMemo(() => {
    const order = Array.isArray(savedOrder?.order) ? savedOrder.order : [];
    const at = new Map(order.map((k, i) => [k, i]));
    const fresh = cards.filter((c) => !at.has(c.key));
    const known = cards
      .filter((c) => at.has(c.key))
      .sort((a, b) => at.get(a.key)! - at.get(b.key)!);
    return [...fresh, ...known];
  }, [cards, savedOrder]);
  function storeOrder(keys: string[]) {
    // Guarda também os cartões que agora não se veem (filtros), para não perderem o lugar.
    const previous = Array.isArray(savedOrder?.order) ? savedOrder.order : [];
    const hidden = previous.filter((k) => !keys.includes(k));
    saveOrder.mutate(
      { order: [...keys, ...hidden].slice(0, 500) },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  }
  function moveCard(key: string, move: CardMove) {
    const keys = ordered.map((c) => c.key);
    const from = keys.indexOf(key);
    const to =
      move === "first"
        ? 0
        : move === "last"
          ? keys.length - 1
          : move === "up"
            ? Math.max(0, from - 1)
            : Math.min(keys.length - 1, from + 1);
    if (from < 0 || from === to) return;
    storeOrder(arrayMove(keys, from, to));
  }
  const cardSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  function onCardDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const keys = ordered.map((c) => c.key);
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from >= 0 && to >= 0) storeOrder(arrayMove(keys, from, to));
  }

  if (loading || listsLoading) return <Skeleton className="h-40" />;
  return (
    <div className="flex flex-col gap-4">
      {showLists ? <NewListComposer assignTo={assignTo} /> : null}
      {ordered.length ? (
        <DndContext
          sensors={cardSensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }: DragStartEvent) =>
            setDragging(String(active.id))
          }
          onDragCancel={() => setDragging(null)}
          onDragEnd={onCardDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Para mudar o cartão de lugar, carrega em Espaço, usa as setas e Espaço para largar. Esc cancela.",
            },
          }}
        >
          {/* Os cartões não se mexem enquanto se arrasta (as colunas não o deixam fazer bem): larga-se em cima de outro. */}
          <SortableContext
            items={ordered.map((c) => c.key)}
            strategy={() => null}
          >
            <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
              {ordered.map((card, i) => (
                <BoardCardView
                  key={card.key}
                  card={card}
                  today={today}
                  targets={targets}
                  assigneeName={assigneeName}
                  assignTo={assignTo}
                  index={i}
                  count={ordered.length}
                  onMoveCard={(move) => moveCard(card.key, move)}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {dragging ? (
              <div className="rounded-xl border border-accent bg-surface px-4 py-3 text-sm font-semibold shadow-card">
                {ordered.find((c) => c.key === dragging)?.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        empty
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Pencil className="h-3 w-3" aria-hidden /> Toca no texto de uma tarefa
        para a editar; arrasta pela pega para mudar a ordem (a pega do título
        muda o cartão de lugar, ou usa o ⋯ do cartão). As concluídas dos últimos
        30 dias ficam no fim de cada cartão.
      </p>
    </div>
  );
}
