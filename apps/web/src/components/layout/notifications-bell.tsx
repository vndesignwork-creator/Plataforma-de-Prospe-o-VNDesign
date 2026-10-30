'use client';

/**
 * Sino dos avisos (barra lateral e barra do telemóvel): tarefas que alguém te
 * deu, @menções, lembretes, atrasados do dia, respostas, emails abertos, pedidos
 * pelo site, clientes… Tocar num aviso abre o sítio certo e marca-o como lido.
 * Atualiza sozinho a cada minuto. Os tipos escolhem-se em Definições.
 */
import { formatDateTime, leadPath, notificationTitle, type Notification, type NotificationList } from '@vndesign/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  AtSign,
  Bell,
  CalendarClock,
  CheckCheck,
  Inbox,
  ListChecks,
  MailOpen,
  MessageSquareReply,
  Settings2,
  Sparkles,
  Trash2,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { api, errorMessage } from '@/lib/api-client';
import { useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';

const KEY = ['notifications'];

const ICONS: Record<Notification['kind'], LucideIcon> = {
  task_assigned: ListChecks,
  mention: AtSign,
  reminder: AlarmClock,
  daily: CalendarClock,
  reply: MessageSquareReply,
  email_open: MailOpen,
  site_form: Inbox,
  client: UserCheck,
  system: Sparkles,
};
/** Tarefas e menções mostram o texto entre aspas (título da tarefa, início do comentário). */
const QUOTED = new Set<Notification['kind']>(['task_assigned', 'mention']);

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
        return { data, unread: body.all ? 0 : Math.max(0, old.unread - (body.ids?.length ?? 0)) };
      });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Apagar um aviso ({ id }) ou limpar o sino ({ which: 'read' | 'all' }); sai logo da lista. */
function useDeleteNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string } | { which: 'read' | 'all' }) =>
      'id' in body ? api(`/notifications/${body.id}`, { method: 'DELETE' }) : api('/notifications', { method: 'DELETE', query: { which: body.which } }),
    onMutate: (body) => {
      qc.setQueryData<NotificationList>(KEY, (old) => {
        if (!old) return old;
        const gone = (n: Notification) => ('id' in body ? n.id === body.id : body.which === 'all' || !!n.read_at);
        const data = old.data.filter((n) => !gone(n));
        return { data, unread: data.filter((n) => !n.read_at).length };
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function NotificationsBell({ className }: { className?: string }) {
  const { data } = useNotifications();
  const { data: team } = useTeamNames();
  const markRead = useMarkRead();
  const remove = useDeleteNotifications();
  const router = useRouter();
  const unread = data?.unread ?? 0;
  const items = data?.data ?? [];
  const fresh = items.filter((n) => !n.read_at);
  const seen = items.filter((n) => n.read_at);
  const nameOf = (id: string | null) => (id ? (team?.find((m) => m.user_id === id)?.name ?? null) : null);

  function open(n: Notification) {
    if (!n.read_at) markRead.mutate({ ids: [n.id] });
    if (n.url) router.push(n.url);
    else if (n.lead) router.push(`${leadPath(n.lead)}${n.kind === 'task_assigned' ? '#tarefas' : '#atividade'}`);
  }

  const row = (n: Notification) => {
    const Icon = ICONS[n.kind] ?? Bell;
    const title = notificationTitle(n, nameOf(n.actor_user_id));
    const isNew = !n.read_at;
    return (
      <div key={n.id} className={cn('group/aviso relative flex items-start rounded-lg', isNew && 'bg-accent-soft/60')}>
        {isNew ? <span className="absolute top-3 left-1 h-2 w-2 rounded-full bg-accent" aria-hidden /> : null}
        <DropdownItem onSelect={() => open(n)} className="min-w-0 flex-1 items-start pl-4">
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', isNew ? 'text-accent-text' : 'text-muted')} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className={cn('block text-sm', isNew ? 'font-semibold text-fg' : 'text-muted')}>
              {title}
              {isNew ? <span className="sr-only"> (por ler)</span> : null}
            </span>
            <span className={cn('line-clamp-2 text-sm', isNew ? 'text-fg/80' : 'text-muted')}>{QUOTED.has(n.kind) ? `“${n.text}”` : n.text}</span>
            <span className="block text-xs text-muted">
              {n.lead ? `#${n.lead.number} ${n.lead.company_name} · ` : ''}
              {formatDateTime(n.created_at)}
            </span>
          </span>
        </DropdownItem>
        <DropdownItem
          onSelect={(e) => {
            e.preventDefault();
            remove.mutate({ id: n.id });
          }}
          aria-label={`Apagar aviso: ${title}`}
          className="mt-1 shrink-0 px-2 text-muted opacity-60 group-hover/aviso:opacity-100 data-[highlighted]:opacity-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </DropdownItem>
      </div>
    );
  };

  return (
    <DropdownRoot>
      <DropdownTrigger
        className={cn('relative rounded-lg p-2 text-fg hover:bg-surface-2', className)}
        aria-label={unread ? `Avisos: ${unread} por ler` : 'Avisos'}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread ? (
          // O número desenhado por CSS (não é texto): o nome do botão diz o número exato ("Avisos: 64 por ler").
          <span
            data-count={unread > 9 ? '9+' : String(unread)}
            className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-semibold text-accent-fg tabular before:content-[attr(data-count)]"
            aria-hidden
          />
        ) : null}
      </DropdownTrigger>
      <DropdownContent align="end" className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto">
        {items.length ? (
          <>
            <DropdownLabel>{fresh.length ? `Por ler (${fresh.length})` : 'Nada por ler'}</DropdownLabel>
            {fresh.map(row)}
            {seen.length ? (
              <>
                <DropdownSeparator />
                <DropdownLabel>Lidos</DropdownLabel>
                {seen.map(row)}
              </>
            ) : null}
          </>
        ) : (
          <>
            <DropdownLabel>Avisos</DropdownLabel>
            <p className="px-2 py-3 text-sm text-muted">
              Sem avisos. Aparecem aqui os lembretes, os atrasados do dia, as respostas aos emails, os pedidos pelo site, as tarefas que te
              derem e as menções.
            </p>
          </>
        )}
        <DropdownSeparator />
        {unread ? (
          <DropdownItem onSelect={() => markRead.mutate({ all: true })}>
            <CheckCheck className="h-4 w-4 text-muted" aria-hidden /> Marcar todos como lidos
          </DropdownItem>
        ) : null}
        {seen.length ? (
          <DropdownItem onSelect={() => remove.mutate({ which: 'read' })}>
            <Trash2 className="h-4 w-4 text-muted" aria-hidden /> Apagar os lidos
          </DropdownItem>
        ) : null}
        {fresh.length ? (
          <DropdownItem danger onSelect={() => remove.mutate({ which: 'all' })}>
            <Trash2 className="h-4 w-4" aria-hidden /> Limpar todos
          </DropdownItem>
        ) : null}
        <DropdownItem onSelect={() => router.push('/definicoes/lembretes#avisos')}>
          <Settings2 className="h-4 w-4 text-muted" aria-hidden /> Escolher os avisos
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
