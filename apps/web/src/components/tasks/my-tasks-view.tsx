'use client';

/**
 * Página Tarefas: as tarefas por fazer de todos os leads e projetos, pelo prazo
 * (em atraso, hoje, próximos 7 dias, mais tarde, sem prazo). Com equipa, mostra
 * por omissão as minhas; dá para ver as sem responsável, as de todos ou as de
 * uma pessoa, e dar uma tarefa a alguém daqui mesmo. No topo: o resumo (leva à
 * secção), "Nova tarefa", pesquisa e o filtro Leads | Projetos.
 */
import { TASK_GROUP_LABELS, addDays, formatDate, leadPath, taskGroup, todayIso, type TaskGroup, type TaskListItem } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { ListChecks, Plus, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { CollapseButton, setCollapsedKeys, useCollapsed } from '@/components/ui/collapse';
import { Input } from '@/components/ui/input';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { api, errorMessage } from '@/lib/api-client';
import { Linkified } from '@/lib/linkify';
import { useInvalidateTasks, useMe, useSettings, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { DateInput } from '@/components/ui/date-input';
import { NewTaskDialog } from './new-task-dialog';
import { DueChip, DuePicker } from './tasks-card';

const GROUPS: TaskGroup[] = ['overdue', 'today', 'week', 'later', 'none'];

type TaskKind = 'all' | 'leads' | 'projetos';
const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'leads', label: 'Leads' },
  { value: 'projetos', label: 'Projetos' },
];

const SEGMENTED = 'inline-flex h-9 max-w-full items-center overflow-x-auto rounded-lg border border-border-input bg-surface-2 p-0.5 [scrollbar-width:none]';
const segment = (on: boolean, extra?: string) =>
  cn(
    'inline-flex h-full shrink-0 items-center rounded-md px-3 text-sm whitespace-nowrap',
    on ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg',
    extra,
  );

export function MyTasksView() {
  const { data: me } = useMe();
  const { data: team, isPending: teamPending } = useTeamNames();
  const { data: settings } = useSettings();
  const [creating, setCreating] = useState(false);
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

  // Tarefa com "Escolher data…" aberto (calendário por baixo dela).
  const [picking, setPicking] = useState<string | null>(null);

  /** Muda o prazo daqui mesmo (com Anular: volta ao que tinha). */
  async function setDue(task: TaskListItem, due: string) {
    setPicking(null);
    const next = due || null;
    if (next === task.due_on) return;
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { due_on: next } });
      toast.success(next ? `Prazo: ${formatDate(next)}.` : 'Tarefa sem prazo.', {
        action: {
          label: 'Anular',
          onClick: () =>
            void api(`/tasks/${task.id}`, { method: 'PATCH', body: { due_on: task.due_on } })
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
  const showKind = settings?.features.projects !== false;
  const kind = showKind ? ((params.get('tipo') as TaskKind | null) ?? 'all') : 'all';
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const ofKind = (data ?? []).filter((t) => kind === 'all' || (t.lead.status === 'cliente') === (kind === 'projetos'));
  const shown = q
    ? ofKind.filter((t) => `${t.title} ${t.lead.company_name} ${t.lead.project_title ?? ''} #${t.lead.number}`.toLowerCase().includes(q))
    : ofKind;
  const groups = GROUPS.map((g) => ({
    group: g,
    tasks: shown.filter((t) => taskGroup(t.due_on, today, weekEnd) === g),
  })).filter((g) => g.tasks.length);
  const counts = Object.fromEntries(GROUPS.map((g) => [g, ofKind.filter((t) => taskGroup(t.due_on, today, weekEnd) === g).length])) as Record<
    TaskGroup,
    number
  >;
  // Com tarefas mais urgentes, "Mais tarde" e "Sem prazo" começam recolhidas.
  const urgent = counts.overdue + counts.today + counts.week > 0;
  const filtered = !!q || kind !== 'all' || assigned !== (hasTeam ? 'me' : 'all');

  function setKind(value: TaskKind) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('tipo');
    else next.set('tipo', value);
    router.replace(`${pathname}?${next}`);
  }
  function clearFilters() {
    setSearch('');
    router.replace(pathname);
  }
  /** Do resumo do topo: abre a secção (se estava recolhida) e vai até ela. */
  function jump(group: TaskGroup) {
    setCollapsedKeys([`tarefas:${group}`], false);
    requestAnimationFrame(() => document.getElementById(`tarefas-${group}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const summary: { group: TaskGroup; text: string; tone?: 'danger' }[] = [
    counts.overdue
      ? {
          group: 'overdue' as const,
          text: `${counts.overdue} em atraso`,
          tone: 'danger' as const,
        }
      : null,
    counts.today ? { group: 'today' as const, text: `${counts.today} para hoje` } : null,
    counts.week ? { group: 'week' as const, text: `${counts.week} nos próximos 7 dias` } : null,
  ].filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <>
      <PageHeader
        title="Tarefas"
        description={
          <>
            {data ? (
              <span className="flex flex-wrap gap-x-1.5">
                <span>
                  {ofKind.length}
                  {(data?.length ?? 0) >= 500 ? '+' : ''} por fazer
                </span>
                {summary.map((p) => (
                  <Fragment key={p.group}>
                    <span aria-hidden>·</span>
                    <button
                      type="button"
                      onClick={() => jump(p.group)}
                      className={cn('hover:text-fg hover:underline', p.tone === 'danger' && 'font-medium text-danger')}
                    >
                      {p.text}
                    </button>
                  </Fragment>
                ))}
              </span>
            ) : (
              'As tarefas por fazer dos leads e projetos, pelo prazo.'
            )}
            <span className="mt-0.5 flex items-center gap-1 text-xs">
              <ListChecks className="h-3.5 w-3.5" aria-hidden /> Só as por fazer, dos leads e projetos que não estão arquivados.
            </span>
          </>
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Nova tarefa
          </Button>
        }
      />
      {creating ? <NewTaskDialog onClose={() => setCreating(false)} /> : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar tarefa ou lead…"
              aria-label="Procurar tarefa ou lead"
              className="h-9 pl-9"
            />
          </div>
          {hasTeam ? (
            <div role="group" aria-label="De quem" className={SEGMENTED}>
              {filters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={assigned === f.value}
                  onClick={() => setAssigned(f.value)}
                  className={segment(assigned === f.value)}
                >
                  {f.label}
                </button>
              ))}
              <DropdownRoot>
                <DropdownTrigger className={segment(!!person, 'gap-1.5')}>
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
          {showKind ? (
            // À direita (no telemóvel, quando passa para a linha de baixo, também).
            <div role="group" aria-label="Tipo de tarefa" className={cn(SEGMENTED, 'ml-auto')}>
              {KINDS.map((k) => (
                <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)} className={segment(kind === k.value)}>
                  {k.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {errorMessage(error)}
          </p>
        ) : isLoading || teamPending ? (
          <Skeleton className="h-40" />
        ) : !groups.length ? (
          <Card>
            {filtered && (data?.length ?? 0) > 0 ? (
              <EmptyState title="Nenhuma tarefa encontrada">
                <p>Não há tarefas por fazer com esta pesquisa ou filtros.</p>
                <Button variant="outline" className="mt-3" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              </EmptyState>
            ) : (
              <EmptyState title={assigned === 'me' ? 'Não tens tarefas por fazer' : 'Sem tarefas por fazer'}>
                <p>
                  {assigned === 'me'
                    ? 'As tarefas que te derem (e, se és o dono, as que não têm responsável) aparecem aqui com o prazo.'
                    : 'As tarefas criam-se aqui ou na ficha de cada lead ou projeto (cartão Tarefas).'}
                </p>
                <Button className="mt-3" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> Nova tarefa
                </Button>
              </EmptyState>
            )}
          </Card>
        ) : (
          groups.map(({ group, tasks }) => (
            <TaskSection key={group} group={group} count={tasks.length} defaultCollapsed={urgent && (group === 'later' || group === 'none')} forceOpen={!!q}>
              {tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start gap-x-2 gap-y-2 px-4 py-2.5 sm:flex-nowrap sm:gap-3">
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
                    {picking === t.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <DateInput
                          value={t.due_on ?? ''}
                          onChange={(v) => v && void setDue(t, v)}
                          aria-label={`Data do prazo de ${t.title}`}
                          className="w-40"
                        />
                        <button
                          type="button"
                          onClick={() => setPicking(null)}
                          className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
                        >
                          Fechar
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {/* Telemóvel: os botões passam para baixo do texto (alinhados com ele), em vez de o espremerem. */}
                  <div className="flex shrink-0 items-center gap-2 max-sm:basis-full max-sm:pl-6">
                    <DuePicker
                      value={t.due_on ?? ''}
                      today={today}
                      task={t.title}
                      compact
                      onChange={(v) => void setDue(t, v)}
                      onCustom={() => setPicking(t.id)}
                    />
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
                  </div>
                </li>
              ))}
            </TaskSection>
          ))
        )}
        {(data?.length ?? 0) >= 500 ? (
          <p role="status" className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
            Estão aqui as primeiras 500 tarefas (por prazo). Conclui ou apaga as que já não fazem sentido para veres as restantes.
          </p>
        ) : null}
      </div>
    </>
  );
}

/** Uma secção (Em atraso, Hoje…) num cartão que se pode recolher; a escolha fica lembrada. */
function TaskSection({
  group,
  count,
  defaultCollapsed,
  forceOpen,
  children,
}: {
  group: TaskGroup;
  count: number;
  defaultCollapsed: boolean;
  /** A pesquisar: tudo aberto, para se ver o que se encontrou. */
  forceOpen: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCollapsed(`tarefas:${group}`, defaultCollapsed);
  const open = forceOpen || !collapsed;
  const label = TASK_GROUP_LABELS[group];
  return (
    <Card
      id={`tarefas-${group}`}
      className={cn('scroll-mt-20 overflow-hidden', group === 'overdue' && 'border-l-4 border-l-danger', group === 'today' && 'border-l-4 border-l-accent')}
    >
      <div className={cn('flex min-h-11 items-center gap-2 px-4 py-1', open && 'border-b border-border')}>
        <h2 className={cn('flex-1 text-sm font-semibold', group === 'overdue' && 'text-danger', group === 'today' && 'text-accent-text')}>
          {label} <span className="font-normal text-muted tabular">({count})</span>
        </h2>
        {forceOpen ? null : <CollapseButton collapsed={!open} onToggle={() => setCollapsed(open)} label={label} />}
      </div>
      {open ? (
        <ul className="divide-y divide-border" aria-label={label}>
          {children}
        </ul>
      ) : null}
    </Card>
  );
}
