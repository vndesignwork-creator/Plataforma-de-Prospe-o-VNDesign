'use client';

/**
 * Estatísticas → Equipa: o trabalho de cada pessoa nos últimos 30 dias
 * (contactos, respostas, reuniões, clientes, leads criados e gerador).
 * O prospetor vê só os seus números, em cartões.
 */
import { MEMBER_ROLE_LABELS, type TeamStats } from '@vndesign/core';
import { StatTile } from '@/components/charts/stat-tile';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { useTeamStats } from '@/lib/queries';

type Member = TeamStats['members'][number];

const generator = (m: Member) => (m.generation_limit === null ? '—' : `${m.generation_used} de ${m.generation_limit}`);

/** Os números de uma pessoa (Dashboard do prospetor). */
export function MyTeamTiles() {
  const { data } = useTeamStats();
  const me = data?.members[0];
  if (!me) return <Skeleton className="h-24" />;
  return (
    <section aria-label="O meu trabalho" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Contactos hoje" value={me.contacts_today} hint={`${me.contacts} nos últimos ${data!.days} dias`} />
      <StatTile label="Responderam" value={me.replied} hint={`${me.meetings} reuniões · ${me.won} clientes`} />
      <StatTile label="Os meus leads em aberto" value={me.assigned_open} hint={`${me.generated} criados em ${data!.days} dias`} />
      <StatTile label="Gerador esta semana" value={generator(me)} hint={me.generation_limit === null ? undefined : 'leads juntados pela IA (últimos 7 dias)'} />
    </section>
  );
}

/** `bare`: sem o título (a página Estatísticas põe-no na barra da secção). */
export function TeamStatsSection({ bare }: { bare?: boolean } = {}) {
  const { data, isLoading } = useTeamStats();
  if (isLoading || !data) return <Skeleton className="h-40" />;
  return (
    <section aria-labelledby={bare ? undefined : 'equipa-stats'} aria-label={bare ? 'Equipa' : undefined} className="flex flex-col gap-3">
      {bare ? null : (
        <div>
          <h2 id="equipa-stats" className="font-display text-xl font-semibold">
            Equipa
          </h2>
          <p className="text-sm text-muted">O trabalho de cada pessoa nos últimos {data.days} dias.</p>
        </div>
      )}
      <Card>
        <CardHeader title="Por pessoa" description="Contactos que cada pessoa registou; leads de que é responsável que responderam, tiveram reunião ou passaram a cliente (cada lead conta uma vez); leads criados." />
        {/* No telemóvel, um cartão por pessoa (a tabela de 8 colunas obrigava a deslizar para o lado). */}
        <ul className="flex flex-col gap-2 p-3 sm:hidden" aria-label="Trabalho de cada pessoa da equipa">
          {data.members.map((m) => {
            const cells = [
              { label: 'Contactos (hoje)', value: `${m.contacts} (${m.contacts_today})` },
              { label: 'Responderam', value: String(m.replied) },
              { label: 'Reuniões', value: String(m.meetings) },
              { label: 'Clientes', value: String(m.won) },
              { label: 'Leads criados', value: String(m.generated) },
              { label: 'Em aberto', value: String(m.assigned_open) },
              { label: 'Gerador (7 dias)', value: generator(m) },
            ];
            return (
              <li key={m.user_id} className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-sm break-words">
                  <span className="font-medium">{m.name}</span> <span className="text-xs text-muted">· {MEMBER_ROLE_LABELS[m.role]}</span>
                </p>
                {/* Duas colunas; o último, se sobrar sozinho, a toda a largura. Os números nunca partem. */}
                <dl className="mt-2 grid grid-cols-1 gap-y-1 min-[360px]:grid-cols-2 min-[360px]:gap-x-4 min-[360px]:[&>div:last-child:nth-child(odd)]:col-span-2">
                  {cells.map((c) => (
                    <div key={c.label} className="flex min-w-0 items-baseline justify-between gap-2">
                      <dt className="min-w-0 text-xs text-muted">{c.label}</dt>
                      <dd className="shrink-0 text-sm font-medium whitespace-nowrap tabular">{c.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
        <div className="relative hidden overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent sm:block" tabIndex={0} role="region" aria-label="Trabalho de cada pessoa (desliza para o lado)">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Trabalho de cada pessoa da equipa</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Pessoa</th>
                <th className="px-2 py-2 text-right font-medium">Contactos (hoje)</th>
                <th className="px-2 py-2 text-right font-medium">Responderam</th>
                <th className="px-2 py-2 text-right font-medium">Reuniões</th>
                <th className="px-2 py-2 text-right font-medium">Clientes</th>
                <th className="px-2 py-2 text-right font-medium">Leads criados</th>
                <th className="px-2 py-2 text-right font-medium">Em aberto</th>
                <th className="px-4 py-2 text-right font-medium">Gerador (7 dias)</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.user_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-medium">{m.name}</span> <span className="text-xs text-muted">· {MEMBER_ROLE_LABELS[m.role]}</span>
                  </td>
                  <td className="tabular px-2 py-2 text-right">
                    {m.contacts} <span className="text-muted">({m.contacts_today})</span>
                  </td>
                  <td className="tabular px-2 py-2 text-right">{m.replied}</td>
                  <td className="tabular px-2 py-2 text-right">{m.meetings}</td>
                  <td className="tabular px-2 py-2 text-right">{m.won}</td>
                  <td className="tabular px-2 py-2 text-right">{m.generated}</td>
                  <td className="tabular px-2 py-2 text-right">{m.assigned_open}</td>
                  <td className="tabular px-4 py-2 text-right">{generator(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
