'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  LEAD_CHANNEL_META,
  LEAD_CHANNELS,
  LEAD_STATUS_META,
  LEAD_STATUSES,
  formatCurrency,
  formatDate,
  todayIso,
  type Lead,
  type LeadSortField,
} from '@vndesign/core';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/card';
import {
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Input, Select } from '@/components/ui/input';
import { errorMessage, toQueryString } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { usePreference, useLeads, useSectors, useSetPreference } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { ChannelLabel, MobileLabel, PageSpeedScore, StatusBadge } from './badges';
import { MultiSelectFilter } from './multi-select';

const PAGE_SIZE = 50;

type Col = ColumnDef<Lead> & { id: string; meta: { label: string; sort?: LeadSortField; className?: string } };

const muted = <span className="text-muted">—</span>;
const text = (v: string | null, max = 60) =>
  v ? (
    <span title={v.length > max ? v : undefined}>{v.length > max ? `${v.slice(0, max)}…` : v}</span>
  ) : (
    muted
  );

function NextAction({ lead, today }: { lead: Lead; today: string }) {
  if (!lead.next_action_text && !lead.next_action_on) return muted;
  const overdue = lead.next_action_on !== null && lead.next_action_on < today;
  return (
    <span className={cn('flex flex-col leading-tight', overdue && 'text-danger')}>
      {lead.next_action_text ? <span>{lead.next_action_text}</span> : null}
      {lead.next_action_on ? (
        <span className={cn('text-xs tabular', !overdue && 'text-muted')}>
          {formatDate(lead.next_action_on)}
          {overdue ? ' · em atraso' : ''}
        </span>
      ) : null}
    </span>
  );
}

function buildColumns(today: string): Col[] {
  return [
    {
      id: 'number',
      meta: { label: '#', sort: 'number', className: 'w-12 text-right tabular text-muted' },
      cell: ({ row }) => row.original.number,
    },
    {
      id: 'company_name',
      meta: { label: 'Empresa', sort: 'company_name', className: 'min-w-56' },
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          href={`/leads/${row.original.id}`}
          className="font-semibold text-fg hover:text-accent-text hover:underline"
        >
          {row.original.company_name}
        </Link>
      ),
    },
    {
      id: 'sector',
      meta: { label: 'Setor' },
      cell: ({ row }) =>
        row.original.sector ? (
          <span className="whitespace-nowrap">
            <span aria-hidden>{row.original.sector.emoji} </span>
            {row.original.sector.name}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: 'website',
      meta: { label: 'Website' },
      cell: ({ row }) =>
        row.original.website ? (
          <a
            href={row.original.website}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-text hover:underline"
          >
            {displayHost(row.original.website)}
            <span className="sr-only"> (abre num novo separador)</span>
          </a>
        ) : (
          muted
        ),
    },
    { id: 'city', meta: { label: 'Cidade', sort: 'city' }, cell: ({ row }) => text(row.original.city, 30) },
    { id: 'problems', meta: { label: 'Problemas', className: 'min-w-64' }, cell: ({ row }) => text(row.original.problems, 90) },
    {
      id: 'pagespeed',
      meta: { label: 'PageSpeed', sort: 'pagespeed', className: 'text-right' },
      cell: ({ row }) => <PageSpeedScore value={row.original.pagespeed} />,
    },
    { id: 'mobile', meta: { label: 'Mobile?', sort: 'mobile' }, cell: ({ row }) => <MobileLabel mobile={row.original.mobile} /> },
    { id: 'email', meta: { label: 'Email' }, cell: ({ row }) => text(row.original.email, 40) },
    { id: 'phone', meta: { label: 'Telefone' }, cell: ({ row }) => text(row.original.phone, 20) },
    { id: 'contact_name', meta: { label: 'Contacto' }, cell: ({ row }) => text(row.original.contact_name, 30) },
    { id: 'status', meta: { label: 'Estado', sort: 'status' }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'channel', meta: { label: 'Canal', sort: 'channel' }, cell: ({ row }) => <ChannelLabel channel={row.original.channel} /> },
    {
      id: 'first_contact_on',
      meta: { label: '1.º contacto', sort: 'first_contact_on', className: 'tabular' },
      cell: ({ row }) => formatDate(row.original.first_contact_on) || muted,
    },
    {
      id: 'last_follow_up_on',
      meta: { label: 'Último follow-up', sort: 'last_follow_up_on', className: 'tabular' },
      cell: ({ row }) => formatDate(row.original.last_follow_up_on) || muted,
    },
    {
      id: 'next_action',
      meta: { label: 'Próxima ação', sort: 'next_action_on', className: 'min-w-40' },
      cell: ({ row }) => <NextAction lead={row.original} today={today} />,
    },
    {
      id: 'estimated_value',
      meta: { label: 'Valor est.', sort: 'estimated_value', className: 'text-right tabular' },
      cell: ({ row }) => formatCurrency(row.original.estimated_value) || muted,
    },
    { id: 'notes', meta: { label: 'Notas', className: 'min-w-64' }, cell: ({ row }) => text(row.original.notes, 90) },
    {
      id: 'approach_angle',
      meta: { label: 'Ângulo de abordagem', className: 'min-w-64' },
      cell: ({ row }) => text(row.original.approach_angle, 90),
    },
    {
      id: 'source_url',
      meta: { label: 'Fonte' },
      cell: ({ row }) =>
        row.original.source_url ? (
          <a href={row.original.source_url} target="_blank" rel="noreferrer noopener" className="text-accent-text hover:underline">
            {displayHost(row.original.source_url)}
            <span className="sr-only"> (abre num novo separador)</span>
          </a>
        ) : (
          muted
        ),
    },
    {
      id: 'suggested_on',
      meta: { label: 'Sugerido em', sort: 'suggested_on', className: 'tabular' },
      cell: ({ row }) => formatDate(row.original.suggested_on) || muted,
    },
    { id: 'email_subject', meta: { label: 'Assunto do email', className: 'min-w-56' }, cell: ({ row }) => text(row.original.email_subject, 60) },
  ];
}

/** Colunas escondidas por omissão (as restantes da folha ficam a um clique). */
const DEFAULT_HIDDEN = ['website', 'problems', 'email', 'phone', 'contact_name', 'first_contact_on', 'last_follow_up_on', 'notes', 'approach_angle', 'source_url', 'email_subject'];

const DUE_OPTIONS = [
  { value: '', label: 'Todas as próximas ações' },
  { value: 'overdue', label: 'Em atraso' },
  { value: 'today', label: 'Para hoje' },
  { value: 'week', label: 'Próximos 7 dias' },
];

export function LeadsTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = todayIso();

  const get = (k: string) => searchParams.get(k) ?? '';
  const getList = (k: string) => (searchParams.get(k) ?? '').split(',').filter(Boolean);
  const sort = (get('sort') || 'number') as LeadSortField;
  const order = get('order') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(get('page')) || 1);

  function setParams(patch: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      const v = Array.isArray(value) ? value.join(',') : value;
      if (v) next.set(key, v);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Pesquisa e cidade com atraso enquanto se escreve.
  const [search, setSearch] = useState(get('q'));
  const [city, setCity] = useState(get('city'));
  const debouncedSearch = useDebouncedValue(search);
  const debouncedCity = useDebouncedValue(city);
  useEffect(() => {
    if (debouncedSearch !== get('q') || debouncedCity !== get('city')) {
      setParams({ q: debouncedSearch.trim() || null, city: debouncedCity.trim() || null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, debouncedCity]);

  const query = {
    q: get('q') || undefined,
    sector: getList('sector'),
    status: getList('status'),
    channel: getList('channel'),
    city: get('city') || undefined,
    due: get('due') || undefined,
    suggested_from: get('de') || undefined,
    suggested_to: get('ate') || undefined,
    sort,
    order,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, isFetching, error } = useLeads(query);
  const { data: sectors } = useSectors();
  const { data: tablePref } = usePreference<{ hidden: string[] }>('leads.table');
  const saveTablePref = useSetPreference<{ hidden: string[] }>('leads.table');
  const hidden = tablePref?.hidden ?? DEFAULT_HIDDEN;

  const columns = useMemo(() => buildColumns(today), [today]);
  const columnVisibility: VisibilityState = Object.fromEntries(hidden.map((id) => [id, false]));

  // A tabela é recalculada a cada render (não usamos o React Compiler aqui).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { columnVisibility },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (row) => row.id,
  });

  const activeFilters =
    query.sector.length + query.status.length + query.channel.length +
    [query.q, query.city, query.due, query.suggested_from, query.suggested_to].filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(false);

  function toggleSort(field: LeadSortField) {
    if (sort === field) setParams({ order: order === 'asc' ? 'desc' : 'asc', sort: field });
    else setParams({ sort: field, order: field === 'company_name' || field === 'city' ? 'asc' : 'desc' });
  }

  /** Descarrega o ficheiro com os filtros atuais (a API devolve-o como anexo). */
  function download(format: 'csv' | 'xlsx') {
    const a = document.createElement('a');
    a.href = `/api/v1/leads/export${toQueryString({ ...query, page: undefined, limit: undefined, format })}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function clearFilters() {
    setSearch('');
    setCity('');
    router.replace(pathname, { scroll: false });
  }

  const total = data?.meta.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      {/* Pesquisa e ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar empresa, email, cidade, notas…"
            aria-label="Pesquisar leads"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="filtros-leads"
          className="md:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filtros{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
        <DropdownRoot>
          <DropdownTrigger className={buttonClasses('outline', 'md')} aria-label="Escolher colunas visíveis">
            <Columns3 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Colunas</span>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>Colunas visíveis</DropdownLabel>
            {columns
              .filter((c) => c.enableHiding !== false)
              .map((c) => (
                <DropdownCheckboxItem
                  key={c.id}
                  checked={!hidden.includes(c.id)}
                  onCheckedChange={(checked) =>
                    saveTablePref.mutate({
                      hidden: checked ? hidden.filter((h) => h !== c.id) : [...hidden, c.id],
                    })
                  }
                >
                  {c.meta.label}
                </DropdownCheckboxItem>
              ))}
            <DropdownSeparator />
            <DropdownItem onSelect={() => saveTablePref.mutate({ hidden: DEFAULT_HIDDEN })}>Repor colunas</DropdownItem>
            <DropdownItem onSelect={() => saveTablePref.mutate({ hidden: [] })}>Mostrar todas</DropdownItem>
          </DropdownContent>
        </DropdownRoot>
        <DropdownRoot>
          <DropdownTrigger className={buttonClasses('outline', 'md')} aria-label="Exportar leads">
            <Download className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Exportar</span>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>{activeFilters ? 'Exportar leads filtrados' : 'Exportar todos os leads'}</DropdownLabel>
            <DropdownItem onSelect={() => download('xlsx')}>Excel (.xlsx)</DropdownItem>
            <DropdownItem onSelect={() => download('csv')}>CSV (Excel em português)</DropdownItem>
          </DropdownContent>
        </DropdownRoot>
        <Link href="/leads/novo" className={buttonClasses('primary')}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo lead
        </Link>
      </div>

      {/* Filtros */}
      <div
        id="filtros-leads"
        role="group"
        aria-label="Filtros"
        className={cn('flex-wrap items-end gap-2', showFilters ? 'flex' : 'hidden md:flex')}
      >
        <MultiSelectFilter
          label="Setor"
          value={query.sector}
          onChange={(v) => setParams({ sector: v })}
          options={[
            ...(sectors ?? []).map((s) => ({ value: s.id, label: `${s.emoji ?? ''} ${s.name}`.trim() })),
            { value: 'none', label: 'Sem setor' },
          ]}
        />
        <MultiSelectFilter
          label="Estado"
          value={query.status}
          onChange={(v) => setParams({ status: v })}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: `${LEAD_STATUS_META[s].emoji} ${LEAD_STATUS_META[s].label}` }))}
        />
        <MultiSelectFilter
          label="Canal"
          value={query.channel}
          onChange={(v) => setParams({ channel: v })}
          options={[
            ...LEAD_CHANNELS.map((c) => ({ value: c, label: `${LEAD_CHANNEL_META[c].emoji} ${LEAD_CHANNEL_META[c].label}` })),
            { value: 'none', label: 'Sem canal' },
          ]}
        />
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Cidade"
          aria-label="Filtrar por cidade"
          className="w-36"
        />
        <Select value={query.due ?? ''} onChange={(e) => setParams({ due: e.target.value || null })} aria-label="Próxima ação" className="w-auto">
          {DUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">Sugerido em</legend>
          <span className="text-sm text-muted" aria-hidden>
            Sugerido
          </span>
          <Input
            type="date"
            value={query.suggested_from ?? ''}
            onChange={(e) => setParams({ de: e.target.value || null })}
            aria-label="Sugerido desde"
            className="w-38"
          />
          <span className="text-sm text-muted" aria-hidden>
            a
          </span>
          <Input
            type="date"
            value={query.suggested_to ?? ''}
            onChange={(e) => setParams({ ate: e.target.value || null })}
            aria-label="Sugerido até"
            className="w-38"
          />
        </fieldset>
        {activeFilters ? (
          <Button variant="ghost" onClick={clearFilters}>
            <X className="h-4 w-4" aria-hidden />
            Limpar filtros
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted" role="status" aria-live="polite">
        {isLoading ? 'A carregar leads…' : `${total} lead${total === 1 ? '' : 's'}${activeFilters ? ' com estes filtros' : ''}`}
        {isFetching && !isLoading ? ' · a atualizar…' : ''}
      </p>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : null}

      <div className={cn('rounded-xl border border-border bg-surface transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <EmptyState title={activeFilters ? 'Nenhum lead com estes filtros' : 'Ainda não há leads'}>
            {activeFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : (
              <Link href="/leads/novo" className={buttonClasses('primary')}>
                Criar o primeiro lead
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Tabela (tablet/computador) */}
            <div className="hidden max-h-[calc(100dvh-16rem)] overflow-auto md:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Leads — clica no nome da empresa para abrir a ficha</caption>
                <thead className="sticky top-0 z-10 bg-surface-2">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => {
                        const meta = (header.column.columnDef as Col).meta;
                        const sorted = meta.sort && sort === meta.sort ? order : null;
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                            className={cn(
                              'border-b border-border px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase',
                              meta.className?.includes('text-right') && 'text-right',
                            )}
                          >
                            {meta.sort ? (
                              <button
                                type="button"
                                onClick={() => toggleSort(meta.sort!)}
                                className="inline-flex items-center gap-1 uppercase hover:text-fg"
                              >
                                {meta.label}
                                {sorted === 'asc' ? (
                                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                                ) : sorted === 'desc' ? (
                                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                                ) : (
                                  <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />
                                )}
                              </button>
                            ) : (
                              meta.label
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a,button')) return;
                        router.push(`/leads/${row.id}`);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn('px-3 py-2 align-top', (cell.column.columnDef as Col).meta.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartões (telemóvel) */}
            <ul className="divide-y divide-border md:hidden">
              {(data?.data ?? []).map((lead) => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-2">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold">
                        <span className="mr-1.5 text-muted tabular">#{lead.number}</span>
                        {lead.company_name}
                      </span>
                      <StatusBadge status={lead.status} />
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                      {lead.sector ? (
                        <span>
                          {lead.sector.emoji} {lead.sector.name}
                        </span>
                      ) : null}
                      {lead.city ? <span>{lead.city}</span> : null}
                      {lead.estimated_value !== null ? <span className="tabular">{formatCurrency(lead.estimated_value)}</span> : null}
                    </span>
                    {lead.next_action_on || lead.next_action_text ? (
                      <span className="text-sm">
                        <NextAction lead={lead} today={today} />
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {total > PAGE_SIZE ? (
        <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted tabular">
            {from}–{to} de {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setParams({ page: String(page + 1) })}
            >
              Seguinte
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
