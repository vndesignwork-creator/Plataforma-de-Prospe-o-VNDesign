'use client';

/**
 * Sino dos avisos (barra lateral e barra do telemóvel): tarefas que alguém te
 * deu e @menções nos comentários. Tocar num aviso abre o lead no sítio certo e
 * marca-o como lido. Atualiza sozinho a cada minuto.
 */
import { formatDateTime, leadPath, notificationTitle, type Notification, type NotificationList } from '@vndesign/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, CheckCheck, ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { api } from '@/lib/api-client';
import { useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';

const KEY = ['notifications'];

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

export function NotificationsBell({ className }: { className?: string }) {
  const { data } = useNotifications();
  const { data: team } = useTeamNames();
  const markRead = useMarkRead();
  const router = useRouter();
  const unread = data?.unread ?? 0;
  const items = data?.data ?? [];
  const nameOf = (id: string | null) => (id ? (team?.find((m) => m.user_id === id)?.name ?? null) : null);

  function open(n: Notification) {
    if (!n.read_at) markRead.mutate({ ids: [n.id] });
    if (n.lead) router.push(`${leadPath(n.lead)}${n.kind === 'task_assigned' ? '#tarefas' : '#atividade'}`);
  }

  return (
    <DropdownRoot>
      <DropdownTrigger
        className={cn('relative rounded-lg p-2 text-fg hover:bg-surface-2', className)}
        aria-label={unread ? `Avisos: ${unread} por ler` : 'Avisos'}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-semibold text-accent-fg tabular" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </DropdownTrigger>
      <DropdownContent align="end" className="max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
        <DropdownLabel>Avisos</DropdownLabel>
        {items.length ? (
          items.map((n) => {
            const Icon = n.kind === 'task_assigned' ? ListChecks : AtSign;
            return (
              <DropdownItem key={n.id} onSelect={() => open(n)} className="items-start">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', n.read_at ? 'text-muted' : 'text-accent-text')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', !n.read_at && 'font-semibold')}>
                    {notificationTitle(n, nameOf(n.actor_user_id))}
                    {n.read_at ? null : <span className="sr-only"> (por ler)</span>}
                  </span>
                  <span className="block truncate text-sm text-muted">“{n.text}”</span>
                  <span className="block text-xs text-muted">
                    {n.lead ? `#${n.lead.number} ${n.lead.company_name} · ` : ''}
                    {formatDateTime(n.created_at)}
                  </span>
                </span>
              </DropdownItem>
            );
          })
        ) : (
          <p className="px-2 py-3 text-sm text-muted">Sem avisos. Aparecem aqui as tarefas que te derem e quando te mencionarem num comentário.</p>
        )}
        {unread ? (
          <>
            <DropdownSeparator />
            <DropdownItem onSelect={() => markRead.mutate({ all: true })}>
              <CheckCheck className="h-4 w-4 text-muted" aria-hidden /> Marcar todos como lidos
            </DropdownItem>
          </>
        ) : null}
      </DropdownContent>
    </DropdownRoot>
  );
}
