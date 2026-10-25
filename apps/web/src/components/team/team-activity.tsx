'use client';

/**
 * Equipa → Atividade: "quem fez o quê" — os registos de cada pessoa nos leads
 * (contactos, mudanças de estado, emails…), com filtro por pessoa e período.
 */
import { ACTIVITY_TYPE_LABELS, formatDateTime, leadPath, type Activity, type TeamActivity } from '@vndesign/core';
import { Edit3 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { describe, ICONS } from '@/components/leads/activity-timeline';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { useMe, useTeamActivity, useTeamNames } from '@/lib/queries';

const PERIODS = [
  { days: 1, label: 'Hoje e ontem' },
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
];

const asActivity = (a: TeamActivity): Activity => ({ ...a, lead_id: a.lead.id, actor_token_id: null });

export function TeamActivityList() {
  const [user, setUser] = useState('');
  const [days, setDays] = useState(7);
  const { data: me } = useMe();
  const { data: team } = useTeamNames();
  const avatars = new Map((team ?? []).map((m) => [m.user_id, m.avatar_url]));
  const { data, isLoading } = useTeamActivity({ user: user || undefined, days });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Pessoa" className="h-9 w-auto text-sm">
          <option value="">Todas as pessoas</option>
          {(team ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user_id === me?.user.id ? `${m.name} (tu)` : m.name}
            </option>
          ))}
        </Select>
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período" className="h-9 w-auto text-sm">
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </Select>
        {data ? <span className="text-sm text-muted">{data.length === 200 ? 'os 200 registos mais recentes' : `${data.length} registo${data.length === 1 ? '' : 's'}`}</span> : null}
      </div>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data?.length ? (
        <Card>
          <EmptyState title="Sem atividade neste período">
            <p className="text-sm text-muted">Os contactos, mudanças de estado e emails de cada pessoa aparecem aqui.</p>
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <ol className="flex flex-col divide-y divide-border" aria-label="Atividade da equipa">
            {data.map((a) => {
              const Icon = ICONS[a.type] ?? Edit3;
              const detail = describe(asActivity(a));
              return (
                <li key={a.id} className="flex gap-3 px-4 py-3 text-sm">
                  {/* A foto de quem fez (ou as iniciais), com o tipo de registo num selo. */}
                  <span className="relative h-8 w-8 shrink-0">
                    <Avatar name={a.actor_name ?? '?'} url={avatars.get(a.actor_user_id ?? '')} size={32} />
                    <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface-2">
                      <Icon className="h-2.5 w-2.5 text-muted" aria-hidden />
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-medium">{a.actor_user_id === me?.user.id ? 'Tu' : (a.actor_name ?? 'Alguém')}</span>
                      <span className="text-muted"> · {ACTIVITY_TYPE_LABELS[a.type]} · </span>
                      <Link href={leadPath(a.lead)} className="font-medium text-accent-text hover:underline">
                        {a.lead.company_name}
                      </Link>
                    </p>
                    {detail ? <p className="text-muted">{detail}</p> : null}
                    {a.body ? <p className="mt-0.5 line-clamp-2 break-words whitespace-pre-line">{a.body}</p> : null}
                    <p className="mt-0.5 text-xs text-muted tabular">
                      <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
