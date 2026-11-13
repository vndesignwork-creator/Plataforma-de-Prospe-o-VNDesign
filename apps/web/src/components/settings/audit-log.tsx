'use client';

/**
 * Definições → Registo de alterações: quem mudou definições, exportou leads, convidou ou
 * removeu alguém, criou ou revogou chaves da API… e quando. (As mudanças nos leads ficam
 * na linha do tempo de cada lead e em Equipa → Atividade.)
 */
import { formatDate, formatDateTime, type AuditEvent } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

export function AuditLog() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-audit'],
    queryFn: () => api<{ data: AuditEvent[] }>('/platform/audit').then((r) => r.data),
  });
  const [who, setWho] = useState('');
  const people = [...new Set((data ?? []).map((e) => e.actor))].sort((a, b) => a.localeCompare(b, 'pt'));
  const rows = (data ?? []).filter((e) => !who || e.actor === who);
  // Por dia (o mais recente primeiro).
  const days = new Map<string, AuditEvent[]>();
  for (const e of rows) {
    const day = e.at.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  return (
    <Card>
      <CardHeader
        title="Registo de alterações"
        description="O que se mudou fora dos leads: definições, exportações, equipa, chaves da API, o que se apagou de vez."
        actions={
          people.length > 1 ? (
            <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filtrar por pessoa" className="h-9 w-auto">
              <option value="">Todas as pessoas</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          ) : null
        }
      />
      <div className="px-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : error ? (
          <p className="text-sm text-danger">{errorMessage(error)}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">Ainda não há nada registado.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {[...days.entries()].map(([day, events]) => (
              <section key={day} aria-label={formatDate(day)}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{formatDate(day)}</h3>
                <ul className="flex flex-col" aria-label={`Alterações de ${formatDate(day)}`}>
                  {events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 border-t border-border py-1.5 text-sm first:border-t-0">
                      <span className="text-xs text-muted tabular">{formatDateTime(e.at).slice(-5)}</span>
                      <span className="font-medium">{e.actor}</span>
                      <span className="min-w-0 basis-full break-words sm:basis-auto">{e.summary}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          As mudanças nos leads ficam na linha do tempo de cada um e em{' '}
          <Link href="/equipa" className="underline hover:text-fg">
            Equipa → Atividade
          </Link>
          . Os últimos 200 registos.
        </p>
      </div>
    </Card>
  );
}
