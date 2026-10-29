'use client';

/**
 * Equipa → Atividade: "quem fez o quê" — os registos de cada pessoa nos leads
 * (contactos, mudanças de estado, emails…), por dia, com filtro por pessoa,
 * período e tipo. Edições seguidas do mesmo lead juntam-se numa linha.
 */
import {
  ACTIVITY_TYPE_LABELS,
  TEAM_ACTIVITY_GROUPS,
  formatDate,
  leadPath,
  todayIso,
  type Activity,
  type ActivityType,
  type TeamActivity,
  type TeamActivityGroup,
} from '@vndesign/core';
import { Edit3 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { describe, ICONS } from '@/components/leads/activity-timeline';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { useMe, useTeamActivity, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';

const PERIODS = [
  { days: 1, label: 'Hoje e ontem' },
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 90, label: 'Últimos 90 dias' },
];

/** Edições do mesmo lead pela mesma pessoa com menos de 15 minutos entre si contam como uma. */
const MERGE_MS = 15 * 60_000;

/** Cor do ícone de cada tipo (pelo grupo do filtro). */
const GROUP_TONES: Record<TeamActivityGroup, string> = {
  contactos: 'bg-accent-soft text-accent-text',
  leads: 'bg-success/15 text-success',
  edicoes: 'bg-surface-3 text-muted',
  tarefas: 'bg-warning-soft text-warning',
  ia: 'bg-accent-soft text-accent-text',
  projetos: 'bg-success/15 text-success',
};
const groupOf = (type: ActivityType) =>
  (Object.keys(TEAM_ACTIVITY_GROUPS) as TeamActivityGroup[]).find((g) => (TEAM_ACTIVITY_GROUPS[g].types as readonly string[]).includes(type));

type Row = TeamActivity & { edits: number };

const lisbonDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });
const lisbonTime = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long' });

function dayLabel(day: string): string {
  const today = todayIso();
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === today) return 'Hoje';
  if (day === yesterday.toISOString().slice(0, 10)) return 'Ontem';
  const name = weekday.format(new Date(`${day}T12:00:00Z`));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}, ${formatDate(day)}`;
}

/** Junta as edições seguidas (mesma pessoa, mesmo lead, pouco tempo) numa só linha, com os campos todos. */
function mergeEdits(items: TeamActivity[]): Row[] {
  const rows: Row[] = [];
  for (const a of items) {
    const prev = rows[rows.length - 1];
    if (
      prev &&
      a.type === 'updated' &&
      prev.type === 'updated' &&
      prev.lead.id === a.lead.id &&
      prev.actor_user_id === a.actor_user_id &&
      new Date(prev.created_at).getTime() - new Date(a.created_at).getTime() < MERGE_MS
    ) {
      const fields = [...new Set([...((prev.payload.fields as string[]) ?? []), ...((a.payload.fields as string[]) ?? [])])];
      rows[rows.length - 1] = { ...prev, payload: { ...prev.payload, fields }, edits: prev.edits + 1 };
    } else rows.push({ ...a, edits: 1 });
  }
  return rows;
}

const asActivity = (a: TeamActivity): Activity => ({ ...a, lead_id: a.lead.id, actor_token_id: null });

export function TeamActivityList() {
  const [user, setUser] = useState('');
  const [days, setDays] = useState(7);
  const [group, setGroup] = useState<TeamActivityGroup | ''>('');
  const { data: me } = useMe();
  const { data: team } = useTeamNames();
  const avatars = new Map((team ?? []).map((m) => [m.user_id, m.avatar_url]));
  const several = (team?.length ?? 0) > 1;
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useTeamActivity({ user: user || undefined, days, group: group || undefined });

  const days_ = useMemo(() => {
    const rows = mergeEdits((data?.pages ?? []).flat());
    const byDay = new Map<string, Row[]>();
    for (const r of rows) {
      const day = lisbonDay.format(new Date(r.created_at));
      byDay.set(day, [...(byDay.get(day) ?? []), r]);
    }
    return [...byDay.entries()];
  }, [data]);
  const total = days_.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {several ? (
          <Select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Pessoa" className="h-9 w-auto text-sm">
            <option value="">Todas as pessoas</option>
            {(team ?? []).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user_id === me?.user.id ? `${m.name} (tu)` : m.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período" className="h-9 w-auto text-sm">
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </Select>
        {data ? (
          <span className="text-sm text-muted">
            {total} registo{total === 1 ? '' : 's'}
            {hasNextPage ? ' (há mais)' : ''}
          </span>
        ) : null}
      </div>
      <div role="group" aria-label="Tipo de registo" className="flex flex-wrap gap-1.5">
        {([['', 'Todos'], ...Object.entries(TEAM_ACTIVITY_GROUPS).map(([k, g]) => [k, g.label])] as [TeamActivityGroup | '', string][]).map(([key, label]) => (
          <button
            key={key || 'todos'}
            type="button"
            aria-pressed={group === key}
            onClick={() => setGroup(key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors pointer-coarse:py-1.5',
              group === key ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:text-fg',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !total ? (
        <Card>
          <EmptyState title="Sem atividade neste período">
            <p className="text-sm text-muted">Os contactos, mudanças de estado e emails de cada pessoa aparecem aqui.</p>
          </EmptyState>
        </Card>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Atividade da equipa">
          {days_.map(([day, rows]) => (
            <section key={day} aria-label={dayLabel(day)}>
              <h3 className="sticky top-0 z-10 mb-1.5 bg-bg/95 py-1 text-xs font-semibold tracking-wide text-muted uppercase backdrop-blur">
                {dayLabel(day)} <span className="font-normal normal-case">· {rows.length}</span>
              </h3>
              <Card>
                <ol className="flex flex-col divide-y divide-border">
                  {rows.map((a) => {
                    const Icon = ICONS[a.type] ?? Edit3;
                    const g = groupOf(a.type);
                    const detail = describe(asActivity(a));
                    const who = a.actor_user_id === me?.user.id ? 'Tu' : (a.actor_name ?? 'Alguém');
                    return (
                      <li key={a.id} className="flex items-start gap-3 px-3 py-2 text-sm sm:px-4">
                        <span className={cn('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', g ? GROUP_TONES[g] : 'bg-surface-3 text-muted')}>
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-1.5">
                            {several ? (
                              <span className="inline-flex items-center gap-1.5 font-medium">
                                <Avatar name={a.actor_name ?? '?'} url={avatars.get(a.actor_user_id ?? '')} size={18} />
                                {who}
                              </span>
                            ) : null}
                            <span className={several ? 'text-muted' : 'font-medium'}>
                              {several ? '· ' : ''}
                              {a.edits > 1 ? `Lead editado (${a.edits} vezes)` : ACTIVITY_TYPE_LABELS[a.type]}
                            </span>
                            <span className="text-muted">·</span>
                            <Link href={leadPath(a.lead)} className="font-medium text-accent-text hover:underline">
                              {a.lead.company_name}
                            </Link>
                          </p>
                          {detail ? <p className="text-muted">{detail}</p> : null}
                          {a.body ? <p className="mt-0.5 line-clamp-2 break-words whitespace-pre-line">{a.body}</p> : null}
                        </div>
                        <time dateTime={a.created_at} className="mt-0.5 shrink-0 text-xs text-muted tabular-nums">
                          {lisbonTime.format(new Date(a.created_at))}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </section>
          ))}
          {hasNextPage ? (
            <Button variant="outline" className="self-center" onClick={() => void fetchNextPage()} loading={isFetchingNextPage}>
              Carregar mais
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}
