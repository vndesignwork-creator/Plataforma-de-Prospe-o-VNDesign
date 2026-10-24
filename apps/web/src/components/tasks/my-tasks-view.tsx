'use client';

/**
 * Página Tarefas: as tarefas por fazer de todos os leads e projetos, pelo prazo
 * (em atraso, hoje, próximos 7 dias, mais tarde, sem prazo). Com equipa, mostra
 * por omissão as minhas; dá para ver as sem responsável, as de todos ou as de
 * uma pessoa, e dar uma tarefa a alguém daqui mesmo.
 */
import { TASK_GROUP_LABELS, addDays, leadPath, taskGroup, todayIso, type TaskGroup, type TaskListItem } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { ListChecks, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { api, errorMessage } from '@/lib/api-client';
import { Linkified } from '@/lib/linkify';
import { useInvalidateTasks, useMe, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { DueChip } from './tasks-card';

const GROUPS: TaskGroup[] = ['overdue', 'today', 'week', 'later', 'none'];

export function MyTasksView() {
  const { data: me } = useMe();
  const { data: team, isPending: teamPending } = useTeamNames();
  const hasTeam = (team?.length ?? 0) > 1;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Sozinho, as tarefas não têm responsável: mostra todas.
  const assigned = params.get('de') ?? (hasTeam ? 'me' : 'all');
  const [today] = useState(() => todayIso());
  const weekEnd = addDays(today, 7);
  const invalidate = useInvalidateTasks();
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-tasks', assigned],
    queryFn: () => api<{ data: TaskListItem[] }>('/tasks', { query: { assigned } }).then((r) => r.data),
    enabled: !teamPending,
  });
  const nameOf = (id: string | null | undefined) => (id ? (id === me?.user.id ? 'Tu' : (team?.find((m) => m.user_id === id)?.name ?? 'Antigo membro')) : null);

  function setAssigned(value: string) {
    const next = new URLSearchParams(params);
    next.set('de', value);
    router.replace(`${pathname}?${next}`);
  }

  async function complete(task: TaskListItem) {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: true } });
      toast.success('Tarefa concluída.', {
        action: {
          label: 'Anular',
          onClick: () =>
            void api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: false } })
              .catch((e) => toast.error(errorMessage(e)))
              .finally(() => invalidate(task.lead_id)),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      invalidate(task.lead_id);
    }
  }

  async function assign(task: TaskListItem, userId: string | null) {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { assigned_to: userId } });
      toast.success(userId ? `Tarefa dada a ${nameOf(userId) === 'Tu' ? 'ti' : nameOf(userId)}.` : 'Tarefa sem responsável.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      invalidate(task.lead_id);
    }
  }

  const filters = [
    { value: 'me', label: 'As minhas' },
    { value: 'none', label: 'Sem responsável' },
    { value: 'all', label: 'Todas' },
  ];
  const person = team?.find((m) => m.user_id === assigned);
  const groups = GROUPS.map((g) => ({ group: g, tasks: (data ?? []).filter((t) => taskGroup(t.due_on, today, weekEnd) === g) })).filter((g) => g.tasks.length);

  return (
    <div className="flex flex-col gap-4">
      {hasTeam ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="De quem">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={assigned === f.value}
              onClick={() => setAssigned(f.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm',
                assigned === f.value ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {f.label}
            </button>
          ))}
          <DropdownRoot>
            <DropdownTrigger
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
                person ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden /> {person ? person.name : 'De uma pessoa…'}
            </DropdownTrigger>
            <DropdownContent align="start">
              {(team ?? []).map((m) => (
                <DropdownItem key={m.user_id} onSelect={() => setAssigned(m.user_id)}>
                  {m.name}
                  {m.user_id === me?.user.id ? ' (tu)' : ''}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownRoot>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : isLoading || teamPending ? (
        <Skeleton className="h-40" />
      ) : !groups.length ? (
        <Card>
          <EmptyState title={assigned === 'me' ? 'Não tens tarefas por fazer' : 'Sem tarefas por fazer'}>
            <p>
              {assigned === 'me'
                ? 'As tarefas que te derem (e, se és o dono, as que não têm responsável) aparecem aqui com o prazo.'
                : 'As tarefas criam-se na ficha de cada lead ou projeto (cartão Tarefas).'}
            </p>
          </EmptyState>
        </Card>
      ) : (
        groups.map(({ group, tasks }) => (
          <Card key={group}>
            <h2 className={cn('border-b border-border px-4 py-2.5 text-sm font-semibold', group === 'overdue' && 'text-danger')}>
              {TASK_GROUP_LABELS[group]} <span className="font-normal text-muted tabular">({tasks.length})</span>
            </h2>
            <ul className="divide-y divide-border" aria-label={TASK_GROUP_LABELS[group]}>
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    onChange={() => void complete(t)}
                    aria-label={`Concluir: ${t.title}`}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm break-words whitespace-pre-line">
                      <Linkified text={t.title} /> {t.due_on ? <DueChip due={t.due_on} today={today} /> : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <Link href={`${leadPath(t.lead)}#tarefas`} className="hover:text-fg hover:underline">
                        #{t.lead.number} {t.lead.company_name}
                        {t.lead.project_title ? ` · ${t.lead.project_title}` : ''}
                      </Link>
                    </p>
                  </div>
                  {hasTeam ? (
                    <DropdownRoot>
                      <DropdownTrigger
                        className="inline-flex max-w-36 shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-fg"
                        aria-label={`Responsável por ${t.title}: ${nameOf(t.assigned_to) ?? 'ninguém'}`}
                      >
                        <UserRound className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{nameOf(t.assigned_to) ?? 'Ninguém'}</span>
                      </DropdownTrigger>
                      <DropdownContent>
                        <DropdownLabel>Dar a</DropdownLabel>
                        {(team ?? []).map((m) => (
                          <DropdownItem key={m.user_id} onSelect={() => void assign(t, m.user_id)} disabled={m.user_id === t.assigned_to}>
                            {m.name}
                            {m.user_id === me?.user.id ? ' (tu)' : ''}
                          </DropdownItem>
                        ))}
                        <DropdownSeparator />
                        <DropdownItem onSelect={() => void assign(t, null)} disabled={!t.assigned_to}>
                          Ninguém
                        </DropdownItem>
                      </DropdownContent>
                    </DropdownRoot>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
      {groups.length ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ListChecks className="h-3.5 w-3.5" aria-hidden /> Só as por fazer, dos leads e projetos que não estão arquivados.
        </p>
      ) : null}
    </div>
  );
}
