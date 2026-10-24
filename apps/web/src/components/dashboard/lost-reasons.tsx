'use client';

/** Estatísticas → "Porque perdes leads": os leads em "Sem interesse" por motivo (cada barra abre a lista). */
import { LOST_REASON_LABELS, type LostReasonCount } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BarList } from '@/components/charts/bar-list';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api-client';

export function LostReasonsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats-lost-reasons'],
    queryFn: () => api<{ data: LostReasonCount[] }>('/stats/lost-reasons').then((r) => r.data),
  });
  const withReason = (data ?? []).filter((r) => r.reason).reduce((s, r) => s + r.count, 0);
  return (
    <Card>
      <CardHeader
        title="Porque perdes leads"
        description="Os leads em “Sem interesse”, pelo motivo escolhido ao mudar o estado"
        actions={
          <Link href="/leads?status=sem_interesse" className="text-sm text-accent-text hover:underline">
            Ver os leads
          </Link>
        }
      />
      <div className="p-4">
        {isLoading ? (
          <Skeleton className="h-28" />
        ) : (
          <>
            <BarList
              caption="Leads em Sem interesse por motivo"
              emptyText="Ainda não há leads em “Sem interesse”."
              items={(data ?? []).map((r) => ({
                key: r.reason ?? 'none',
                label: r.reason ? LOST_REASON_LABELS[r.reason] : 'Sem motivo',
                value: r.count,
              }))}
            />
            {data?.length && !withReason ? (
              <p className="mt-3 text-xs text-muted">Ao passar um lead a “Sem interesse”, escolhe o motivo: o gráfico enche-se com o tempo.</p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
