'use client';

/**
 * Sino dos avisos (barra lateral e barra do telemóvel): tarefas que alguém te
 * deu, @menções, lembretes, atrasados do dia, respostas, emails abertos, pedidos
 * pelo site, clientes… Cada tipo tem a sua cor; os avisos agrupam-se por dia e
 * os que pedem uma ação têm-na logo ali (tarefa feita, adiar, responder, ligar).
 * No computador abre um menu; no telemóvel, um painel de baixo para cima.
 * Atualiza sozinho a cada minuto. Os tipos escolhem-se em Definições.
 */
import {
  NOTIFICATION_DAY_LABELS,
  describeNotification,
  formatDateTime,
  leadPath,
  notificationDay,
  timeAgo,
  type Notification,
  type NotificationDay,
  type NotificationIcon,
  type NotificationList,
  type NotificationTone,
  type NotificationView,
} from '@vndesign/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  AlarmClockPlus,
  AtSign,
  Ban,
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  Inbox,
  ListChecks,
  MailOpen,
  MailX,
  MessageSquareReply,
  Phone,
  Reply,
  Settings2,
  Sparkles,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateTasks, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';

const KEY = ['notifications'];
const SETTINGS = '/definicoes/lembretes#avisos';

const ICONS: Record<NotificationIcon, LucideIcon> = {
  task_assigned: ListChecks,
  mention: AtSign,
  reminder: AlarmClock,
  meeting: CalendarDays,
  daily: CalendarClock,
  reply: MessageSquareReply,
  bounce: MailX,
  blocked: Ban,
  email_open: MailOpen,
  site_form: Inbox,
  client: UserCheck,
  system: Sparkles,
};

/** Cor do tipo: a etiqueta em texto e o ícone num círculo suave. */
const TONES: Record<NotificationTone, { text: string; chip: string }> = {
  accent: { text: 'text-accent-text', chip: 'bg-accent-soft text-accent-text' },
  warning: { text: 'text-warning', chip: 'bg-warning-soft text-warning' },
  success: { text: 'text-success', chip: 'bg-success-soft text-success' },
  info: { text: 'text-info', chip: 'bg-info-soft text-info' },
  violet: { text: 'text-violet', chip: 'bg-violet-soft text-violet' },
  danger: { text: 'text-danger', chip: 'bg-danger-soft text-danger' },
  muted: { text: 'text-muted', chip: 'bg-surface-3 text-muted' },
};

const DAYS: NotificationDay[] = ['today', 'yesterday', 'week', 'older'];

export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<NotificationList>('/notifications'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api('/notifications/read', { method: 'POST', body }),
    onMutate: (body) => {
      // Fica logo como lido (o pedido segue atrás).
      qc.setQueryData<NotificationList>(KEY, (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const data = old.data.map((n) => (!n.read_at && (body.all || body.ids?.includes(n.id)) ? { ...n, read_at: now } : n));
        return { data, unread: data.filter((n) => !n.read_at).length };
      });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Tira avisos da lista já (o pedido segue atrás). */
function dropFromCache(qc: ReturnType<typeof useQueryClient>, gone: (n: Notification) => boolean) {
  qc.setQueryData<NotificationList>(KEY, (old) => {
    if (!old) return old;
    const data = old.data.filter((n) => !gone(n));
    return { data, unread: data.filter((n) => !n.read_at).length };
  });
}

function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}`, { method: 'DELETE' }),
    onMutate: (id) => dropFromCache(qc, (n) => n.id === id),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * "Apagar os lidos" / "Limpar todos": saem logo e há 5 s para "Anular" antes de se apagarem mesmo.
 * (O sino fecha-se: com ele aberto, o primeiro clique fora só o fecharia e o "Anular" pedia dois.)
 */
function useClearNotifications() {
  const qc = useQueryClient();
  return (which: 'read' | 'all') => {
    const before = qc.getQueryData<NotificationList>(KEY);
    void qc.cancelQueries({ queryKey: KEY });
    dropFromCache(qc, (n) => which === 'all' || !!n.read_at);
    let undone = false;
    const timer = window.setTimeout(() => {
      if (undone) return;
      api('/notifications', { method: 'DELETE', query: { which } })
        .catch((error) => toast.error(errorMessage(error)))
        .finally(() => void qc.invalidateQueries({ queryKey: KEY }));
    }, 5000);
    toast.success(which === 'all' ? 'Avisos limpos.' : 'Avisos lidos apagados.', {
      duration: 5000,
      action: {
        label: 'Anular',
        onClick: () => {
          undone = true;
          window.clearTimeout(timer);
          qc.setQueryData(KEY, before);
        },
      },
    });
  };
}

// -----------------------------------------------------------------------------
// O mesmo conteúdo serve o menu (computador) e o painel (telemóvel): no menu os
// botões são itens do menu (setas do teclado); no painel, botões grandes.
// -----------------------------------------------------------------------------
type Mode = { sheet: boolean; close: () => void };
const ModeContext = createContext<Mode>({ sheet: false, close: () => undefined });

function Act({
  onSelect,
  keepOpen,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  onSelect: () => void;
  /** Não fecha o sino (ex.: apagar um aviso, marcar como feita). */
  keepOpen?: boolean;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  const { sheet, close } = useContext(ModeContext);
  if (!sheet) {
    return (
      <DropdownItem
        onSelect={(e) => {
          if (keepOpen) e.preventDefault();
          onSelect();
        }}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </DropdownItem>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        onSelect();
        if (!keepOpen) close();
      }}
      className={cn('flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2 [&>svg]:shrink-0', className)}
    >
      {children}
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  const { sheet } = useContext(ModeContext);
  return sheet ? (
    <p className="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{children}</p>
  ) : (
    <DropdownLabel>{children}</DropdownLabel>
  );
}

function Separator() {
  const { sheet } = useContext(ModeContext);
  return sheet ? <hr className="my-2 border-border" /> : <DropdownSeparator />;
}

/** Botão pequeno das ações rápidas (por baixo do aviso). */
const quick = 'min-h-7 gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs font-medium [&>svg]:h-3.5 [&>svg]:w-3.5';
const quickSheet = 'min-h-10 px-3 text-sm [&>svg]:h-4 [&>svg]:w-4';

function Row({ n, view, onOpen, actions }: { n: Notification; view: NotificationView; onOpen: () => void; actions: ReactNode }) {
  const { sheet } = useContext(ModeContext);
  const remove = useDeleteNotification();
  const Icon = ICONS[view.icon] ?? Bell;
  const tone = TONES[view.tone];
  const isNew = !n.read_at;
  return (
    <div className="group/aviso relative">
      {/* Por ler: uma barra fina à esquerda (o fundo fica neutro). */}
      {isNew ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" aria-hidden /> : null}
      <div className="flex items-start">
        <Act onSelect={onOpen} className="min-w-0 flex-1 items-start gap-3 py-2 pl-3">
          <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', tone.chip)} aria-hidden>
            <Icon className="h-4 w-4" />
          </span>
          {/* O título vem primeiro (é o nome que se ouve); a linha "Lembrete · #13 … · há 5 min" sobe por CSS. */}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn('line-clamp-2 text-sm', isNew ? 'font-semibold text-fg' : 'text-fg/80')}>
              {view.title}
              {isNew ? <span className="sr-only"> (por ler)</span> : null}
            </span>
            {view.detail ? <span className="line-clamp-2 text-sm text-muted">{view.detail}</span> : null}
            <span className="order-first flex min-w-0 items-center gap-1 text-xs text-muted">
              <span className={cn('shrink-0 font-semibold', tone.text)}>{view.label}</span>
              {n.lead ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">
                    #{n.lead.number} {n.lead.company_name}
                  </span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <time dateTime={n.created_at} title={formatDateTime(n.created_at)} className="shrink-0 tabular">
                {timeAgo(n.created_at)}
              </time>
            </span>
          </span>
        </Act>
        <Act
          keepOpen
          onSelect={() => remove.mutate(n.id)}
          aria-label={`Apagar aviso: ${view.title}`}
          className={cn('mt-1 shrink-0 px-2 text-muted', !sheet && 'opacity-50 group-hover/aviso:opacity-100 data-[highlighted]:opacity-100')}
        >
          <X className="h-4 w-4" aria-hidden />
        </Act>
      </div>
      {actions ? <div className="flex flex-wrap gap-1.5 pb-2 pl-[3.25rem]">{actions}</div> : null}
    </div>
  );
}

function BellContent({ items, unread }: { items: Notification[]; unread: number }) {
  const { sheet } = useContext(ModeContext);
  const { data: team } = useTeamNames();
  const markRead = useMarkRead();
  const remove = useDeleteNotification();
  const clear = useClearNotifications();
  const invalidateTasks = useInvalidateTasks();
  const router = useRouter();
  const nameOf = (id: string | null) => (id ? (team?.find((m) => m.user_id === id)?.name ?? null) : null);
  const seen = items.filter((n) => n.read_at).length;

  function open(n: Notification) {
    if (!n.read_at) markRead.mutate({ ids: [n.id] });
    if (n.url) router.push(n.url);
    else if (n.lead) router.push(`${leadPath(n.lead)}${n.kind === 'task_assigned' ? '#tarefas' : '#atividade'}`);
  }

  async function taskDone(n: Notification) {
    if (!n.task_id) return;
    try {
      await api(`/tasks/${n.task_id}`, { method: 'PATCH', body: { done: true } });
      remove.mutate(n.id);
      toast.success('Tarefa feita.', {
        action: {
          label: 'Anular',
          onClick: () =>
            void api(`/tasks/${n.task_id}`, { method: 'PATCH', body: { done: false } })
              .catch((e) => toast.error(errorMessage(e)))
              .finally(() => n.lead_id && invalidateTasks(n.lead_id)),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (n.lead_id) invalidateTasks(n.lead_id);
    }
  }

  /** O lembrete volta daqui a 1 hora (este aviso sai do sino; o novo chega à hora). */
  async function snooze(n: Notification) {
    if (!n.task_id) return;
    const at = new Date(Date.now() + 60 * 60_000);
    try {
      await api(`/tasks/${n.task_id}`, { method: 'PATCH', body: { remind_at: at.toISOString() } });
      remove.mutate(n.id);
      const time = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }).format(at);
      toast.success(`Lembrete adiado para as ${time}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (n.lead_id) invalidateTasks(n.lead_id);
    }
  }

  function actionsFor(n: Notification, view: NotificationView): ReactNode {
    const cls = cn(quick, sheet && quickSheet);
    if (view.action === 'task') {
      return (
        <>
          <Act keepOpen onSelect={() => void taskDone(n)} className={cn(cls, 'text-success')}>
            <Check aria-hidden /> Feita
          </Act>
          <Act keepOpen onSelect={() => void snooze(n)} className={cls}>
            <AlarmClockPlus aria-hidden /> Adiar 1 h
          </Act>
        </>
      );
    }
    if (view.action === 'reply') {
      return (
        <Act onSelect={() => open(n)} className={cls}>
          <Reply aria-hidden /> Responder
        </Act>
      );
    }
    if (view.action === 'call' && n.lead?.phone) {
      const phone = n.lead.phone;
      return (
        <Act
          onSelect={() => {
            if (!n.read_at) markRead.mutate({ ids: [n.id] });
            window.location.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
          }}
          className={cls}
        >
          <Phone aria-hidden /> Ligar
        </Act>
      );
    }
    return null;
  }

  const groups = DAYS.map((day) => ({ day, list: items.filter((n) => notificationDay(n.created_at) === day) })).filter((g) => g.list.length);

  return (
    <>
      <div className={cn('flex items-center gap-1', sheet ? 'px-1 pb-1' : 'px-2 pt-1 pb-1')}>
        <p className="text-sm">
          {sheet ? null : <span className="font-semibold">Avisos</span>}
          {items.length ? (
            <span className="text-muted">
              {sheet ? '' : ' · '}
              {unread ? `${unread} por ler` : 'Tudo lido'}
            </span>
          ) : null}
        </p>
        <span className="ml-auto" />
        {unread ? (
          <Act
            keepOpen
            onSelect={() => markRead.mutate({ all: true })}
            className={cn('min-h-7 px-2 py-0.5 text-xs font-medium text-accent-text', sheet && 'min-h-10 text-sm')}
          >
            Marcar todos como lidos
          </Act>
        ) : null}
        {items.length ? (
          <Act
            onSelect={() => router.push(SETTINGS)}
            aria-label="Escolher os avisos"
            className={cn('min-h-7 px-1.5 py-0.5 text-muted', sheet && 'min-h-10 px-2.5')}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
          </Act>
        ) : null}
      </div>

      {items.length ? (
        groups.map(({ day, list }) => (
          <div key={day} role="group" aria-label={NOTIFICATION_DAY_LABELS[day]}>
            <GroupLabel>{NOTIFICATION_DAY_LABELS[day]}</GroupLabel>
            {list.map((n) => {
              const view = describeNotification(n, nameOf(n.actor_user_id));
              return <Row key={n.id} n={n} view={view} onOpen={() => open(n)} actions={actionsFor(n, view)} />;
            })}
          </div>
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 pt-4 pb-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden>
            <Check className="h-5 w-5" />
          </span>
          <p className="font-medium">Tudo em dia</p>
          <p className="text-sm text-muted">
            Sem avisos. Aparecem aqui os lembretes, as respostas aos emails, os emails abertos, os pedidos pelo site e as tarefas que te derem.
          </p>
          <Act onSelect={() => router.push(SETTINGS)} className={cn('justify-center text-sm font-medium text-accent-text', sheet && 'w-full')}>
            <Settings2 className="h-4 w-4" aria-hidden /> Escolher os avisos
          </Act>
        </div>
      )}

      {seen || unread ? (
        <>
          <Separator />
          <div className="flex items-center justify-end gap-1">
            {seen ? (
              <Act onSelect={() => clear('read')} className={cn('min-h-7 px-2 py-0.5 text-xs text-muted', sheet && 'min-h-10 text-sm')}>
                Apagar os lidos
              </Act>
            ) : null}
            {unread ? (
              <Act
                onSelect={() => clear('all')}
                className={cn('min-h-7 px-2 py-0.5 text-xs text-muted hover:text-danger data-[highlighted]:text-danger', sheet && 'min-h-10 text-sm')}
              >
                Limpar todos
              </Act>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}

function Badge({ unread }: { unread: number }) {
  if (!unread) return null;
  // O número desenhado por CSS (não é texto): o nome do botão diz o número exato ("Avisos: 64 por ler").
  return (
    <span
      data-count={unread > 9 ? '9+' : String(unread)}
      className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-semibold text-accent-fg tabular before:content-[attr(data-count)]"
      aria-hidden
    />
  );
}

/** `sheet`: no telemóvel abre um painel de baixo para cima, com botões maiores. */
export function NotificationsBell({ className, sheet = false }: { className?: string; sheet?: boolean }) {
  const { data } = useNotifications();
  const [open, setOpen] = useState(false);
  const unread = data?.unread ?? 0;
  const items = data?.data ?? [];
  const label = unread ? `Avisos: ${unread} por ler` : 'Avisos';
  const triggerClass = cn('relative rounded-lg p-2 text-fg hover:bg-surface-2', className);

  if (sheet) {
    return (
      <>
        <button type="button" className={triggerClass} aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Bell className="h-5 w-5" aria-hidden />
          <Badge unread={unread} />
        </button>
        {open ? (
          <Dialog
            open
            onOpenChange={setOpen}
            title="Avisos"
            className="top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]"
          >
            <ModeContext.Provider value={{ sheet: true, close: () => setOpen(false) }}>
              <div className="-mx-3 -my-2">
                <BellContent items={items} unread={unread} />
              </div>
            </ModeContext.Provider>
          </Dialog>
        ) : null}
      </>
    );
  }

  return (
    <DropdownRoot open={open} onOpenChange={setOpen}>
      <DropdownTrigger className={triggerClass} aria-label={label}>
        <Bell className="h-5 w-5" aria-hidden />
        <Badge unread={unread} />
      </DropdownTrigger>
      <DropdownContent align="end" className="max-h-[75dvh] w-[25rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto">
        <ModeContext.Provider value={{ sheet: false, close: () => setOpen(false) }}>
          <BellContent items={items} unread={unread} />
        </ModeContext.Provider>
      </DropdownContent>
    </DropdownRoot>
  );
}
