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
  type TaskListWithTasks,
} from "@vndesign/core";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  Archive,
  ArchiveRestore,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  GripVertical,
  MoreVertical,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
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
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input, Textarea } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import { verticalOnly } from "@/lib/dnd";
import {
  useInvalidateTasks,
  useMe,
  usePreference,
  useSetPreference,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  TaskRow,
  copyText,
  doneMessage,
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

/** Sem acentos e em minúsculas (pesquisa nos arquivados). */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
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

/** Cores dos cartões (de cada pessoa, como a ordem e o "afixar"). Tons leves que servem no claro e no escuro. */
const CARD_COLORS = {
  red: { label: "Vermelho", card: "border-red-500/40 bg-red-500/10", dot: "bg-red-500" },
  orange: { label: "Laranja", card: "border-orange-500/40 bg-orange-500/10", dot: "bg-orange-500" },
  yellow: { label: "Amarelo", card: "border-amber-400/50 bg-amber-400/15", dot: "bg-amber-400" },
  green: { label: "Verde", card: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-500" },
  teal: { label: "Azul-petróleo", card: "border-teal-500/40 bg-teal-500/10", dot: "bg-teal-500" },
  blue: { label: "Azul", card: "border-sky-500/40 bg-sky-500/10", dot: "bg-sky-500" },
  purple: { label: "Roxo", card: "border-violet-500/40 bg-violet-500/10", dot: "bg-violet-500" },
  pink: { label: "Rosa", card: "border-pink-500/40 bg-pink-500/10", dot: "bg-pink-500" },
  gray: { label: "Cinzento", card: "border-zinc-500/40 bg-zinc-500/10", dot: "bg-zinc-500" },
} as const;
type CardColor = keyof typeof CARD_COLORS;
const isCardColor = (v: unknown): v is CardColor =>
  typeof v === "string" && v in CARD_COLORS;
/** Preferência do quadro: a ordem, os afixados, as cores e os arquivados (por cartão). */
type BoardPrefs = {
  order?: string[];
  pinned?: string[];
  colors?: Record<string, string>;
  /** Cartões de leads (e "Sem lista") arquivados: chave → quando. As listas guardam-no na própria lista. */
  archived?: Record<string, string>;
  /** Cartões recolhidos (só o título e os números). */
  collapsed?: string[];
};

export function useTaskLists() {
  return useQuery({
    queryKey: ["task-lists"],
    queryFn: () => api<{ data: TaskList[] }>("/task-lists").then((r) => r.data),
  });
}

/** "Nova lista": título e as primeiras tarefas (uma por linha), como uma nota do Keep. */
function NewListComposer({
  assignTo,
  hasTeam,
}: {
  assignTo: string | null;
  hasTeam: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState("");
  const [shared, setShared] = useState(false);
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
          ...(shared ? { shared: true } : {}),
        },
      });
      toast.success(
        shared
          ? `Lista “${list.title}” criada e partilhada com a equipa.`
          : `Lista “${list.title}” criada.`,
      );
      setTitle("");
      setItems("");
      setShared(false);
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
        {hasTeam ? (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="h-4 w-4"
            />
            Partilhar com a equipa
          </label>
        ) : null}
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
  color,
  pinned,
  onPin,
  onColor,
  viewer,
  archived = false,
  onArchive,
  collapsed = false,
  onCollapse,
}: {
  index: number;
  count: number;
  onMoveCard: (move: CardMove) => void;
  color: CardColor | null;
  pinned: boolean;
  onPin: (pin: boolean) => void;
  onColor: (color: CardColor | null) => void;
  /** Quem está a ver: partilhar/apagar só quem criou a lista, o dono ou um administrador. */
  viewer: { id: string | null; role: string | null; hasTeam: boolean };
  /** No arquivo: sem caixa de nova tarefa; o menu desarquiva ou apaga. */
  archived?: boolean;
  /** Arquivar/desarquivar um cartão que não é uma lista (lead ou "Sem lista"). */
  onArchive?: (archive: boolean) => void;
  /** Recolhido: só o título, as por fazer e as em atraso. */
  collapsed?: boolean;
  onCollapse?: (collapse: boolean) => void;
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
  } = useSortable({ id: card.key, disabled: archived });
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
          ...(phrase.repeat ? { repeat: phrase.repeat } : {}),
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
          doneMessage(task),
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
          ...(task.repeat ? { repeat: task.repeat } : {}),
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

  async function patchList(body: { shared?: boolean; archived?: boolean }) {
    if (!card.list) return;
    try {
      await api(`/task-lists/${card.list.id}`, { method: "PATCH", body });
      if (body.archived === true)
        toast.success(`Lista “${card.title}” arquivada.`, {
          action: {
            label: "Anular",
            onClick: () => void patchList({ archived: false }),
          },
        });
      else if (body.archived === false)
        toast.success(`Lista “${card.title}” de volta ao quadro.`);
      else if (body.shared)
        toast.success(
          `Lista “${card.title}” partilhada: toda a equipa a vê e pode mexer.`,
        );
      else toast.success(`Lista “${card.title}” deixou de ser partilhada.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      void qc.invalidateQueries({ queryKey: ["task-lists"] });
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
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
    doneByName: assigneeName(task.done_by),
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

  const canManage =
    !card.list?.created_by ||
    card.list.created_by === viewer.id ||
    viewer.role === "owner" ||
    viewer.role === "admin";
  const sharedBy =
    card.list?.shared && card.list.created_by && card.list.created_by !== viewer.id
      ? assigneeName(card.list.created_by)
      : null;
  const overdue = card.pending.filter((t) => t.due_on && t.due_on < today).length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
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
          color && CARD_COLORS[color].card,
          isDragging && "opacity-40",
          isOver && !isDragging && "ring-2 ring-accent",
        )}
        aria-label={card.title}
        data-color={color ?? undefined}
      >
        <div className="flex items-start gap-2 px-4 pt-3 pb-2 text-sm">
          {count > 1 && !archived ? (
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
          {onCollapse ? (
            <button
              type="button"
              onClick={() => onCollapse(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Abrir" : "Recolher"} o cartão: ${card.title}`}
              title={collapsed ? "Abrir o cartão" : "Recolher o cartão (só o título)"}
              className="-my-0.5 shrink-0 rounded p-1 text-muted hover:bg-surface-3 hover:text-fg"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} aria-hidden />
            </button>
          ) : null}
          <CardTitle card={card} onRename={renameList} />
          {archived ? (
            <span className="mt-0.5 shrink-0 rounded bg-surface-3 px-1.5 text-xs text-muted">Arquivado</span>
          ) : null}
          {overdue ? (
            <span
              className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-danger-soft px-1.5 text-xs font-semibold text-danger tabular"
              title={`${overdue} em atraso`}
              aria-label={`${overdue} em atraso`}
            >
              {overdue}
            </span>
          ) : null}
          {collapsed ? (
            <span className="mt-0.5 shrink-0 text-xs text-muted tabular">
              {pending.length} por fazer
            </span>
          ) : null}
          {pinned ? (
            <Pin
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted"
              aria-label="Afixado"
            />
          ) : null}
          {card.list?.shared && viewer.hasTeam ? (
            <span
              className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded bg-surface-3 px-1.5 text-xs text-muted"
              title={
                sharedBy
                  ? `Partilhada por ${sharedBy}: toda a equipa vê e pode mexer`
                  : "Partilhada com a equipa: todos veem e podem mexer"
              }
            >
              <Users className="h-3 w-3" aria-hidden />
              {sharedBy ? `de ${sharedBy}` : "Partilhada"}
            </span>
          ) : null}
          <DropdownRoot
            open={menuOpen}
            onOpenChange={(v) => {
              const next = typeof v === "function" ? v(menuOpen) : v;
              setMenuOpen(next);
              if (!next) setMoveOpen(false);
            }}
          >
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
              {!archived ? (
                <DropdownItem onSelect={() => onPin(!pinned)}>
                  {pinned ? (
                    <>
                      <PinOff className="h-4 w-4" aria-hidden /> Desafixar
                    </>
                  ) : (
                    <>
                      <Pin className="h-4 w-4" aria-hidden /> Afixar no topo
                    </>
                  )}
                </DropdownItem>
              ) : null}
              {!card.list && onArchive ? (
                <DropdownItem onSelect={() => onArchive(!archived)}>
                  {archived ? (
                    <>
                      <ArchiveRestore className="h-4 w-4" aria-hidden /> Desarquivar
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4" aria-hidden /> Arquivar
                    </>
                  )}
                </DropdownItem>
              ) : null}
              <DropdownSeparator />
              <DropdownLabel>
                <span className="inline-flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" aria-hidden /> Cor
                </span>
              </DropdownLabel>
              <div className="flex max-w-56 flex-wrap gap-1 px-1.5 pb-1">
                <DropdownItem
                  aria-label="Cor: sem cor"
                  onSelect={() => onColor(null)}
                  className="h-7 w-7 justify-center rounded-full p-0"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border-strong">
                    {!color ? <Check className="h-3 w-3" aria-hidden /> : null}
                  </span>
                </DropdownItem>
                {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => (
                  <DropdownItem
                    key={c}
                    aria-label={`Cor: ${CARD_COLORS[c].label}`}
                    onSelect={() => onColor(c)}
                    className="h-7 w-7 justify-center rounded-full p-0"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-white",
                        CARD_COLORS[c].dot,
                      )}
                    >
                      {color === c ? (
                        <Check className="h-3 w-3" aria-hidden />
                      ) : null}
                    </span>
                  </DropdownItem>
                ))}
              </div>
              {count > 1 && !archived ? (
                <>
                  <DropdownSeparator />
                  {/* Os quatro "Mover" abrem por baixo, no próprio menu (um submenu ao lado não cabe no telemóvel). */}
                  <DropdownItem
                    aria-expanded={moveOpen}
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoveOpen((v) => !v);
                    }}
                  >
                    <ArrowUpDown className="h-4 w-4" aria-hidden /> Mover
                    <ChevronRight className={cn("ml-auto h-4 w-4 text-muted transition-transform", moveOpen && "rotate-90")} aria-hidden />
                  </DropdownItem>
                  {moveOpen ? (
                    <>
                      <DropdownItem className="pl-8" disabled={index === 0} onSelect={() => onMoveCard("first")}>
                        <ArrowUpToLine className="h-4 w-4" aria-hidden /> Para o início
                      </DropdownItem>
                      <DropdownItem className="pl-8" disabled={index === 0} onSelect={() => onMoveCard("up")}>
                        <ArrowUp className="h-4 w-4" aria-hidden /> Para antes
                      </DropdownItem>
                      <DropdownItem className="pl-8" disabled={index === count - 1} onSelect={() => onMoveCard("down")}>
                        <ArrowDown className="h-4 w-4" aria-hidden /> Para depois
                      </DropdownItem>
                      <DropdownItem className="pl-8" disabled={index === count - 1} onSelect={() => onMoveCard("last")}>
                        <ArrowDownToLine className="h-4 w-4" aria-hidden /> Para o fim
                      </DropdownItem>
                    </>
                  ) : null}
                </>
              ) : null}
              {card.list ? (
                <>
                  <DropdownSeparator />
                  {viewer.hasTeam && canManage && !archived ? (
                    <DropdownItem
                      onSelect={() =>
                        void patchList({ shared: !card.list!.shared })
                      }
                    >
                      <Share2 className="h-4 w-4" aria-hidden />
                      {card.list.shared
                        ? "Deixar de partilhar"
                        : "Partilhar com a equipa"}
                    </DropdownItem>
                  ) : null}
                  <DropdownItem
                    onSelect={() => void patchList({ archived: !archived })}
                  >
                    {archived ? (
                      <>
                        <ArchiveRestore className="h-4 w-4" aria-hidden />{" "}
                        Desarquivar
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4" aria-hidden /> Arquivar
                      </>
                    )}
                  </DropdownItem>
                  {canManage ? (
                    <DropdownItem danger onSelect={() => void deleteList()}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Apagar a lista
                    </DropdownItem>
                  ) : null}
                </>
              ) : null}
            </DropdownContent>
          </DropdownRoot>
        </div>
        {/* Escrever e Enter: a tarefa entra em cima (aceita "sexta às 10h"). */}
        {archived || collapsed ? null : (
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
        )}
        {collapsed ? null : pending.length ? (
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
        {card.done.length && !collapsed ? (
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
  hasTeam = false,
  loading,
  empty,
}: {
  /** Há equipa (mais de uma pessoa): partilhar listas e "quem marcou". */
  hasTeam?: boolean;
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

  // A ordem, os afixados e as cores dos cartões são de cada pessoa (preferência).
  // Os que ainda não estão na ordem (ex.: lista nova) vêm primeiro; os afixados ficam em cima.
  const { data: me } = useMe();
  const { data: savedOrder } = usePreference<BoardPrefs>(BOARD_ORDER_KEY);
  const saveOrder = useSetPreference<BoardPrefs>(BOARD_ORDER_KEY);
  const pinnedKeys = useMemo(
    () => new Set(Array.isArray(savedOrder?.pinned) ? savedOrder.pinned : []),
    [savedOrder],
  );
  const colorOf = (key: string): CardColor | null => {
    const c = savedOrder?.colors?.[key];
    return isCardColor(c) ? c : null;
  };
  // Um cartão de lead arquivado volta ao quadro sozinho se entretanto aparecer uma tarefa nova.
  const archivedAt = useMemo(() => {
    const raw = savedOrder?.archived;
    return raw && typeof raw === "object" ? raw : {};
  }, [savedOrder]);
  const [boardCards, archivedCards] = useMemo(() => {
    const isArchived = (c: BoardCard) => {
      const at = archivedAt[c.key];
      return !c.list && !!at && c.pending.every((t) => (t.created_at ?? "") <= at);
    };
    return [cards.filter((c) => !isArchived(c)), cards.filter(isArchived)];
  }, [cards, archivedAt]);
  const ordered = useMemo(() => {
    const order = Array.isArray(savedOrder?.order) ? savedOrder.order : [];
    const at = new Map(order.map((k, i) => [k, i]));
    const fresh = boardCards.filter((c) => !at.has(c.key));
    const known = boardCards
      .filter((c) => at.has(c.key))
      .sort((a, b) => at.get(a.key)! - at.get(b.key)!);
    const all = [...fresh, ...known];
    return [
      ...all.filter((c) => pinnedKeys.has(c.key)),
      ...all.filter((c) => !pinnedKeys.has(c.key)),
    ];
  }, [boardCards, savedOrder, pinnedKeys]);
  const collapsedKeys = useMemo(
    () => new Set(Array.isArray(savedOrder?.collapsed) ? savedOrder.collapsed : []),
    [savedOrder],
  );
  // "Só com atrasadas": os cartões com alguma tarefa com prazo antes de hoje.
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const hasOverdue = (c: BoardCard) => c.pending.some((t) => t.due_on && t.due_on < today);
  const overdueCount = ordered.filter(hasOverdue).length;
  const shown = onlyOverdue ? ordered.filter(hasOverdue) : ordered;
  const pinnedCards = shown.filter((c) => pinnedKeys.has(c.key));
  const otherCards = shown.filter((c) => !pinnedKeys.has(c.key));
  function savePrefs(next: Partial<BoardPrefs>) {
    saveOrder.mutate(
      {
        order: Array.isArray(savedOrder?.order) ? savedOrder.order : [],
        pinned: [...pinnedKeys],
        colors: savedOrder?.colors ?? {},
        archived: archivedAt,
        collapsed: [...collapsedKeys],
        ...next,
      },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  }
  function storeOrder(keys: string[]) {
    // Guarda também os cartões que agora não se veem (filtros), para não perderem o lugar.
    const previous = Array.isArray(savedOrder?.order) ? savedOrder.order : [];
    const hidden = previous.filter((k) => !keys.includes(k));
    savePrefs({ order: [...keys, ...hidden].slice(0, 500) });
  }
  function pinCard(key: string, pin: boolean) {
    const next = new Set(pinnedKeys);
    if (pin) next.add(key);
    else next.delete(key);
    savePrefs({ pinned: [...next].slice(0, 200) });
  }
  function archiveCard(card: BoardCard, archive: boolean) {
    const archived = { ...archivedAt };
    if (archive) archived[card.key] = new Date().toISOString();
    else delete archived[card.key];
    // Guarda só os mais recentes (não cresce para sempre).
    const kept = Object.fromEntries(
      Object.entries(archived)
        .sort((a, b) => b[1].localeCompare(a[1]))
        .slice(0, 300),
    );
    savePrefs({ archived: kept, pinned: [...pinnedKeys].filter((k) => !archive || k !== card.key) });
    if (archive)
      toast.success(`“${card.title}” arquivado.`, {
        description: "Volta ao quadro se aparecer uma tarefa nova.",
        action: { label: "Anular", onClick: () => archiveCard(card, false) },
      });
    else toast.success(`“${card.title}” de volta ao quadro.`);
  }
  function collapseCard(key: string, collapse: boolean) {
    const next = new Set(collapsedKeys);
    if (collapse) next.add(key);
    else next.delete(key);
    savePrefs({ collapsed: [...next].slice(0, 300) });
  }
  function collapseAll(collapse: boolean) {
    const keys = ordered.map((c) => c.key);
    const next = new Set(collapsedKeys);
    for (const k of keys) {
      if (collapse) next.add(k);
      else next.delete(k);
    }
    savePrefs({ collapsed: [...next].slice(0, 300) });
  }
  function colorCard(key: string, color: CardColor | null) {
    const colors = { ...(savedOrder?.colors ?? {}) };
    if (color) colors[key] = color;
    else delete colors[key];
    savePrefs({ colors });
  }
  function moveCard(key: string, move: CardMove) {
    // Cada grupo (afixados / outros) muda de ordem dentro de si.
    const group = pinnedKeys.has(key) ? pinnedCards : otherCards;
    const groupKeys = group.map((c) => c.key);
    const allKeys = ordered.map((c) => c.key);
    const from = groupKeys.indexOf(key);
    const to =
      move === "first"
        ? 0
        : move === "last"
          ? groupKeys.length - 1
          : move === "up"
            ? Math.max(0, from - 1)
            : Math.min(groupKeys.length - 1, from + 1);
    if (from < 0 || from === to) return;
    const moved = arrayMove(groupKeys, from, to);
    storeOrder(
      pinnedKeys.has(key)
        ? [...moved, ...allKeys.filter((k) => !pinnedKeys.has(k))]
        : [...allKeys.filter((k) => pinnedKeys.has(k)), ...moved],
    );
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
    // Só dentro do mesmo grupo (afixados com afixados).
    if (pinnedKeys.has(String(active.id)) !== pinnedKeys.has(String(over.id)))
      return;
    const keys = ordered.map((c) => c.key);
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from >= 0 && to >= 0) storeOrder(arrayMove(keys, from, to));
  }
  const viewer = {
    id: me?.user.id ?? null,
    role: me?.role ?? null,
    hasTeam,
  };
  const [showArchive, setShowArchive] = useState(false);
  const searchText = fold(query.trim());
  const archive = useQuery({
    queryKey: ["task-lists", "archived"],
    queryFn: () =>
      api<{ data: TaskListWithTasks[] }>("/task-lists", {
        query: { archived: "1" },
      }).then((r) => r.data),
    // Com pesquisa, procura também nas listas arquivadas.
    enabled: (showArchive || !!searchText) && showLists,
  });
  const archivedLists = (showLists ? (archive.data ?? []) : []).filter(
    (l) => !searchText || fold(l.title).includes(searchText) || l.tasks.some((t) => fold(t.title).includes(searchText)),
  );
  const archiveCount = archivedCards.length + archivedLists.length;

  const renderCards = (group: BoardCard[]) => (
    <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
      {group.map((card, i) => (
        <BoardCardView
          key={card.key}
          card={card}
          today={today}
          targets={targets}
          assigneeName={assigneeName}
          assignTo={assignTo}
          index={i}
          count={group.length}
          onMoveCard={(move) => moveCard(card.key, move)}
          color={colorOf(card.key)}
          pinned={pinnedKeys.has(card.key)}
          onPin={(pin) => pinCard(card.key, pin)}
          onColor={(color) => colorCard(card.key, color)}
          onArchive={(archive) => archiveCard(card, archive)}
          collapsed={collapsedKeys.has(card.key)}
          onCollapse={(collapse) => collapseCard(card.key, collapse)}
          viewer={viewer}
        />
      ))}
    </div>
  );

  if (loading || listsLoading) return <Skeleton className="h-40" />;
  return (
    <div className="flex flex-col gap-4">
      {showLists ? (
        <NewListComposer assignTo={assignTo} hasTeam={viewer.hasTeam} />
      ) : null}
      {ordered.length > 1 || overdueCount ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {overdueCount ? (
            <button
              type="button"
              aria-pressed={onlyOverdue}
              onClick={() => setOnlyOverdue((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
                onlyOverdue ? "border-danger bg-danger-soft text-danger" : "border-border text-muted hover:text-fg",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
              Só com atrasadas ({overdueCount})
            </button>
          ) : null}
          {ordered.length > 1 ? (
            <span className="ml-auto flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => collapseAll(true)}>
                Recolher todos
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => collapseAll(false)}>
                Abrir todos
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}
      {shown.length ? (
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
            {pinnedCards.length ? (
              <div role="group" aria-label="Afixados" className="flex flex-col gap-2">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                  <Pin className="h-3 w-3" aria-hidden /> Afixados
                </h2>
                {renderCards(pinnedCards)}
              </div>
            ) : null}
            {otherCards.length ? (
              pinnedCards.length ? (
                <div role="group" aria-label="Outros" className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
                    Outros
                  </h2>
                  {renderCards(otherCards)}
                </div>
              ) : (
                renderCards(otherCards)
              )
            ) : null}
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
      {showLists || archivedCards.length ? (
        // Com pesquisa e resultados nos arquivados, abrem-se sozinhos.
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-fg"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                showArchive && "rotate-90",
              )}
              aria-hidden
            />
            <Archive className="h-4 w-4" aria-hidden /> Arquivados
            {archive.data || !showLists ? ` (${archiveCount})` : archivedCards.length ? ` (${archivedCards.length}+)` : ""}
          </button>
          {showArchive || (searchText && archiveCount) ? (
            archive.isLoading ? (
              <Skeleton className="h-24" />
            ) : archiveCount ? (
              <div className="columns-1 gap-4 opacity-90 md:columns-2 2xl:columns-3">
                {archivedCards.map((card) => (
                  <BoardCardView
                    key={card.key}
                    card={card}
                    today={today}
                    targets={[]}
                    assigneeName={assigneeName}
                    assignTo={assignTo}
                    index={0}
                    count={1}
                    onMoveCard={() => undefined}
                    color={colorOf(card.key)}
                    pinned={false}
                    onPin={() => undefined}
                    onColor={(color) => colorCard(card.key, color)}
                    onArchive={(archive) => archiveCard(card, archive)}
                    viewer={viewer}
                    archived
                  />
                ))}
                {archivedLists.map((list, i) => {
                  const tasks = list.tasks.map((t) => ({ ...t, lead: null }));
                  const card: BoardCard = {
                    key: `list:${list.id}`,
                    container: { kind: "list", listId: list.id },
                    title: list.title,
                    list,
                    pending: tasks.filter((t) => !t.done_at).sort(byPosition),
                    done: tasks.filter((t) => t.done_at),
                  };
                  return (
                    <BoardCardView
                      key={card.key}
                      card={card}
                      today={today}
                      targets={[]}
                      assigneeName={assigneeName}
                      assignTo={assignTo}
                      index={i}
                      count={1}
                      onMoveCard={() => undefined}
                      color={colorOf(card.key)}
                      pinned={false}
                      onPin={() => undefined}
                      onColor={(color) => colorCard(card.key, color)}
                      viewer={viewer}
                      archived
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Nada arquivado. No ⋯ de um cartão, “Arquivar” tira-o do quadro
                sem apagar as tarefas.
              </p>
            )
          ) : null}
        </div>
      ) : null}
      {/* As dicas recolhidas (curtas, só para quem quiser ver). */}
      <details className="group text-xs text-muted">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 hover:text-fg [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
          <Pencil className="h-3 w-3" aria-hidden /> Dicas
        </summary>
        <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-9">
          <li>Toca numa tarefa para a editar.</li>
          <li>Arrasta pela pega ⠿ para mudar a ordem (a do título muda o cartão de lugar).</li>
          <li>No ⋯ do cartão: afixar, cor, mover e arquivar.</li>
          <li>A seta recolhe o cartão; o número vermelho são as atrasadas.</li>
          <li>As concluídas dos últimos 30 dias ficam no fim de cada cartão.</li>
        </ul>
      </details>
    </div>
  );
}
