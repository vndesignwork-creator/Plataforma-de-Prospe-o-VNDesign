'use client';

/**
 * Separador "Clientes" da página Projetos: cada cliente uma vez só, com os
 * projetos que tem, o que falta receber, a próxima tarefa e a próxima renovação.
 *
 * É a mesma ficha de lead (estado "Cliente") vista de outra prateleira: quando o
 * estado muda, o cliente volta sozinho à lista de Leads. Não há ficha de cliente
 * separada, por isso não há nada para sincronizar.
 */
import {
  CLIENT_FILTERS,
  CLIENT_FILTER_LABELS,
  CLIENT_SORTS,
  CLIENT_SORT_LABELS,
  clientMatches,
  clientProjectsLabel,
  formatCurrency,
  formatDate,
  leadPath,
  sortClients,
  todayIso,
  type Client,
  type ClientFilter,
  type ClientSort,
} from '@vndesign/core';
import { Palette, RefreshCw, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { useClients, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

const euros = (v: number) => formatCurrency(v, { decimals: false });
const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const SORT_KEY = 'vnd.clients.sort';
/** Clientes desenhados de cada vez (os restantes com "Mostrar mais"). */
const CLIENTS_PAGE = 30;

/** Topo: quantos clientes há e quanto falta receber. */
function ClientsSummary({ clients }: { clients: Client[] | undefined }) {
  if (!clients) return <>Os teus clientes: projetos, pagamentos e renovações.</>;
  const outstanding = clients.reduce((sum, c) => sum + c.payments.outstanding, 0);
  return (
    <>
      {clients.length} cliente{clients.length === 1 ? '' : 's'}
      {outstanding > 0 ? ` · ${euros(outstanding)} por receber` : ''}
    </>
  );
}

/** Uma linha da lista: o cliente, com o que precisas de saber de relance. */
function ClientRow({ client, showPayments }: { client: Client; showPayments: boolean }) {
  const { lead, payments, next_task: next, renewal } = client;
  const late = payments.overdue > 0;
  return (
    <li className="border-b border-border last:border-0">
      <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
        <div className="min-w-0 flex-1">
          <Link href={leadPath(lead)} className="font-medium hover:underline">
            <span className="tabular text-muted">#{lead.number}</span> {lead.company_name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span>{clientProjectsLabel(client.projects)}</span>
            {client.client_since ? <span>· Cliente desde {formatDate(client.client_since)}</span> : null}
            {lead.city ? <span>· {lead.city}</span> : null}
            {client.brand_kit ? (
              <span className="inline-flex items-center gap-1">
                · <Palette className="h-3 w-3" aria-hidden /> Kit da marca
              </span>
            ) : null}
          </p>
          {next ? (
            <p className="mt-1 truncate text-xs text-muted">
              Próxima tarefa: <span className="text-fg">{next.title}</span>
              {next.due_on ? ` · ${formatDate(next.due_on)}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:justify-end">
          {renewal ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted" title={`${renewal.count} renovação/avença`}>
              <RefreshCw className="h-3 w-3" aria-hidden />
              {formatDate(renewal.next_due_on)}
            </span>
          ) : null}
          {showPayments ? (
            <span className="text-right">
              <span className="block text-xs text-muted">{late ? 'Em atraso' : 'Por receber'}</span>
              <span className={cn('tabular font-medium', late && 'text-danger')}>{euros(late ? payments.overdue : payments.outstanding)}</span>
            </span>
          ) : null}
          <span className="text-right">
            <span className="block text-xs text-muted">Valor</span>
            <span className="tabular font-medium">{euros(client.value)}</span>
          </span>
        </div>
      </div>
    </li>
  );
}

export function ClientsView({ tabs }: { tabs?: ReactNode }) {
  const { data: clients, isLoading } = useClients();
  const { data: settings } = useSettings();
  const showPayments = settings?.features.payments !== false;
  const [today] = useState(() => todayIso());
  const [filter, setFilter] = useState<ClientFilter>('todos');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ClientSort>('recentes');

  // Lembra a última ordem escolhida (neste browser).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY) as ClientSort | null;
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- só depois de montar (localStorage não existe no servidor) */
      if (saved && CLIENT_SORTS.includes(saved)) setSort(saved);
    } catch {
      // sem localStorage: fica a ordem por omissão
    }
  }, []);

  function changeSort(v: ClientSort) {
    setSort(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {
      // sem localStorage: fica só nesta visita
    }
  }

  const counts = Object.fromEntries(CLIENT_FILTERS.map((f) => [f, (clients ?? []).filter((c) => clientMatches(c, f, today)).length])) as Record<ClientFilter, number>;
  const q = norm(search.trim());
  const found = (c: Client) => !q || [c.lead.company_name, c.lead.contact_name, c.lead.city, c.lead.email].some((t) => t && norm(t).includes(q));
  const shown = clients ? sortClients(clients.filter((c) => clientMatches(c, filter, today)).filter(found), sort) : undefined;
  const [limit, setLimit] = useState(CLIENTS_PAGE);
  const rendered = (shown ?? []).slice(0, limit);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Clientes" description={<ClientsSummary clients={clients} />} />
      {tabs}

      {clients?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_14rem] sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar cliente…" aria-label="Procurar cliente" className="h-9 pl-9" />
          </div>
          <div className="relative flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar clientes">
            {CLIENT_FILTERS.filter((f) => f !== 'pagamentos' || showPayments).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                disabled={f !== 'todos' && counts[f] === 0}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted hover:bg-surface-2 disabled:border-dashed disabled:opacity-40 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text pointer-coarse:min-h-10"
              >
                {CLIENT_FILTER_LABELS[f]}
                <span className="tabular text-xs">{counts[f]}</span>
              </button>
            ))}
          </div>
          <Select
            value={sort}
            onChange={(e) => changeSort(e.target.value as ClientSort)}
            aria-label="Ordenar por"
            className="h-9 w-auto max-sm:ml-auto"
          >
            {CLIENT_SORTS.map((s) => (
              <option key={s} value={s}>
                {CLIENT_SORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <Card>
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !clients?.length ? (
          <EmptyState title="Ainda não há clientes">
            Quando mudares um lead para o estado <strong>Cliente</strong>, ele aparece aqui — e sai da lista de Leads. É a mesma ficha: o histórico, os
            contactos e os ficheiros ficam todos.
          </EmptyState>
        ) : !shown?.length ? (
          <EmptyState title="Nenhum cliente com estes filtros">Muda o filtro ou limpa a pesquisa.</EmptyState>
        ) : (
          <>
            <ul aria-label="Clientes">
              {rendered.map((c) => (
                <ClientRow key={c.lead.id} client={c} showPayments={showPayments} />
              ))}
            </ul>
            {shown.length > rendered.length ? (
              <div className="border-t border-border p-3 text-center">
                <Button variant="outline" onClick={() => setLimit((n) => n + CLIENTS_PAGE)}>
                  Mostrar mais ({shown.length - rendered.length})
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {clients?.length ? (
        <p className="flex items-start gap-2 text-xs text-muted">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Os clientes saem da lista de Leads, mas a ficha é a mesma: se mudares o estado, voltam.
        </p>
      ) : null}
    </div>
  );
}
