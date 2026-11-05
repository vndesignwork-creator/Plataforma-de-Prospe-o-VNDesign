'use client';

/** Estatísticas → Receita recorrente: o que entra todos os meses (renovações e avenças) e as próximas datas. */
import { RENEWAL_KIND_LABELS, daysUntil, formatCurrency, formatDate, leadPath, renewalPrice, todayIso } from '@vndesign/core';
import Link from 'next/link';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { errorMessage } from '@/lib/api-client';
import { useRecurringSummary } from '@/lib/queries';

export function RecurringSection() {
  const { data, isLoading, error } = useRecurringSummary();
  if (isLoading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-sm text-danger">{errorMessage(error)}</p>;
  if (!data?.active) {
    return (
      <Card>
        <EmptyState title="Ainda sem renovações nem avenças">
          Na ficha de cada cliente (Projeto → Tempo e dinheiro → Renovações e avenças), regista o domínio, o alojamento ou a manutenção mensal. Aparecem aqui somados.
        </EmptyState>
      </Card>
    );
  }
  const today = todayIso();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Receita recorrente" description={`${data.active} renovaç${data.active === 1 ? 'ão' : 'ões'} ativa${data.active === 1 ? '' : 's'} em ${data.clients} cliente${data.clients === 1 ? '' : 's'}.`} />
        <div className="flex flex-col gap-4 p-4">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted">Por mês</dt>
              <dd className="text-2xl font-semibold tabular">{formatCurrency(data.monthly)}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted">Por ano</dt>
              <dd className="text-2xl font-semibold tabular">{formatCurrency(data.yearly)}</dd>
            </div>
          </dl>
          <ul className="flex flex-col gap-1.5 text-sm" aria-label="Por tipo">
            {data.by_kind.map((k) => (
              <li key={k.kind} className="flex items-center gap-2">
                <span className="flex-1">
                  {RENEWAL_KIND_LABELS[k.kind]} <span className="text-xs text-muted">({k.count})</span>
                </span>
                <span className="font-medium tabular">{formatCurrency(k.monthly)}/mês</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card>
        <CardHeader title="Próximas renovações" description="Nos próximos 60 dias (e as que já passaram)." />
        {data.upcoming.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {data.upcoming.map((u) => {
              const days = daysUntil(u.next_due_on, today);
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm">
                  <Link href={`${leadPath({ number: u.lead_number, company_name: u.company_name })}#projeto`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium">{u.company_name}</span> <span className="text-muted">· {u.title}</span>
                  </Link>
                  <span className="text-muted tabular">{renewalPrice(u.amount, u.period)}</span>
                  <span className={`text-xs tabular ${days < 0 ? 'font-medium text-danger' : days <= 14 ? 'font-medium text-warning' : 'text-muted'}`}>
                    {days < 0 ? `em atraso (${formatDate(u.next_due_on)})` : days === 0 ? 'hoje' : `${formatDate(u.next_due_on)} · ${days} dia${days === 1 ? '' : 's'}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">Nenhuma renovação nos próximos 60 dias.</p>
        )}
      </Card>
    </div>
  );
}
