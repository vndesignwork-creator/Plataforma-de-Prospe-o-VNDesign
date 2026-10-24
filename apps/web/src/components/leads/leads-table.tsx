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
  type LeadArchiveFilter,
  type LeadBulkAction,
  type LeadSortField,
  leadPath,
} from '@vndesign/core';
import { Archive, ArchiveRestore, ArrowDown, ArrowDownUp, ArrowUp, ArrowUpDown, Columns3, CopyX, Download, Map as MapIcon, Search, SlidersHorizontal, Trash2, Upload, UserCheck, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { errorMessage, toQueryString } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { bulkResultMessage, useBulkLeadAction, usePreference, useLeads, useRole, useSectors, useSetPreference, useTeamNames } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { ChannelLabel, MobileLabel, PageSpeedScore, StatusBadge } from './badges';
import { LeadScoreBadge } from './lead-score';
import { MultiSelectFilter, SingleSelectFilter } from './multi-select';
import { BulkFollowUpMenu, BulkStatusMenu, BulkTagMenu } from './bulk-actions';
import { TagChips, useTagFilterOptions } from './tags';
import { ChannelIcon, SectorIconView, StatusIcon } from '@/components/icons/lead-icons';
import { ServiceIcons, useServiceFilterOptions } from '@/components/services/services';
import { TaskProgress } from '@/components/tasks/task-progress';

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

function ArchivedBadge() {
  return (
    <Badge className="ml-2 align-middle">
      <Archive className="h-3 w-3" aria-hidden /> Arquivado
    </Badge>
  );
}

const ARCHIVE_OPTIONS: { value: '' | LeadArchiveFilter; label: string }[] = [
  { value: '', label: 'Sem os arquivados' },
  { value: 'only', label: 'Só os arquivados' },
  { value: 'include', label: 'Com os arquivados' },
];

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
        <>
          <Link
            href={leadPath(row.original)}
            className="font-semibold text-fg hover:text-accent-text hover:underline"
          >
            {row.original.company_name} {row.original.project_title ? <span className="font-normal text-muted">· {row.original.project_title}</span> : null}
          </Link>
          {row.original.archived_at ? <ArchivedBadge /> : null}
          <TagChips tags={row.original.tags} className="mt-1" />
          <TaskProgress progress={row.original.task_progress} className="mt-1 flex w-fit" />
        </>
      ),
    },
    {
      id: 'score',
      meta: { label: 'Prioridade', sort: 'score' },
      cell: ({ row }) => <LeadScoreBadge lead={row.original} />,
    },
    {
      id: 'sector',
      meta: { label: 'Setor' },
      cell: ({ row }) =>
        row.original.sector ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <SectorIconView sector={row.original.sector} className="text-muted" />
            {row.original.sector.name}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: 'services',
      meta: { label: 'Serviços' },
      cell: ({ row }) => (row.original.services?.length ? <ServiceIcons services={row.original.services} /> : muted),
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
            title={row.original.website}
            className="block max-w-56 truncate text-accent-text hover:underline"
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
          <a
            href={row.original.source_url}
            target="_blank"
            rel="noreferrer noopener"
            title={row.original.source_url}
            className="block max-w-56 truncate text-accent-text hover:underline"
          >
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

const MOBILE_SORTS = [
  { value: 'number:desc', label: 'Mais recentes' },
  { value: 'score:desc', label: 'Prioridade (mais quentes)' },
  { value: 'next_action_on:asc', label: 'Próxima ação' },
  { value: 'company_name:asc', label: 'Empresa (A–Z)' },
  { value: 'estimated_value:desc', label: 'Valor estimado' },
  { value: 'status:asc', label: 'Estado' },
  { value: 'number:asc', label: 'Mais antigos' },
];

export function LeadsTable() {
  const router = useRouter();
  const serviceOptions = useServiceFilterOptions();
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
    service: getList('servico'),
    tag: getList('etiqueta'),
    city: get('city') || undefined,
    due: get('due') || undefined,
    suggested_from: get('de') || undefined,
    suggested_to: get('ate') || undefined,
    archived: (get('arquivo') || undefined) as LeadArchiveFilter | undefined,
    assigned: get('resp') || undefined,
    sort,
    order,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, isFetching, error } = useLeads(query);
  const { data: sectors } = useSectors();
  const tagOptions = useTagFilterOptions();
  const { data: tablePref } = usePreference<{ hidden: string[] }>('leads.table');
  const saveTablePref = useSetPreference<{ hidden: string[] }>('leads.table');
  const hidden = tablePref?.hidden ?? DEFAULT_HIDDEN;

  // Equipa: o prospetor não vê valores, nem importa/exporta/apaga; o dono atribui leads.
  const prospector = useRole() === 'prospector';
  const { data: team } = useTeamNames();
  const hasTeam = (team?.length ?? 0) > 1;
  const columns = useMemo(() => buildColumns(today).filter((c) => !(prospector && c.id === 'estimated_value')), [today, prospector]);
  const mobileSorts = prospector ? MOBILE_SORTS.filter((o) => !o.value.startsWith('estimated_value')) : MOBILE_SORTS;
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
    query.sector.length + query.status.length + query.channel.length + query.service.length + query.tag.length +
    [query.q, query.city, query.due, query.suggested_from, query.suggested_to, query.archived, query.assigned].filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(false);

  // Seleção para ações em conjunto. Fica presa aos filtros/página atuais:
  // mudar de página ou de filtro começa uma seleção nova (sem efeitos).
  const selectionKey = JSON.stringify(query);
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const selected = selection.key === selectionKey ? selection.ids : new Set<string>();
  const pageIds = (data?.data ?? []).map((l) => l.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedRows = (data?.data ?? []).filter((l) => selected.has(l.id));
  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelection({ key: selectionKey, ids: next });
  }
  function toggleAll(on: boolean) {
    setSelection({ key: selectionKey, ids: on ? new Set(pageIds) : new Set() });
  }
  const clearSelection = () => setSelection({ key: selectionKey, ids: new Set() });

  const bulk = useBulkLeadAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function runBulk(action: LeadBulkAction, assignedTo?: string | null) {
    const ids = [...selected];
    try {
      const result = await bulk.mutateAsync({ action, ids, ...(action === 'assign' ? { assigned_to: assignedTo ?? null } : {}) });
      clearSelection();
      setConfirmDelete(false);
      const undo = action === 'archive' ? 'restore' : action === 'restore' ? 'archive' : null;
      toast.success(bulkResultMessage(result), {
        action: undo
          ? {
              label: 'Anular',
              onClick: () =>
                bulk.mutate(
                  { action: undo, ids },
                  { onSuccess: (r) => toast.success(bulkResultMessage(r)), onError: (e) => toast.error(errorMessage(e)) },
                ),
            }
          : undefined,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

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
        {/* Telemóvel: pesquisa numa linha; por baixo, Filtros · Ordenar · Exportar alinhados. */}
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
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
        {/* No telemóvel não há cabeçalhos de tabela para ordenar: escolhe-se aqui. */}
        <SingleSelectFilter
          label="Ordenar leads"
          neutral
          value={`${sort}:${order}`}
          onChange={(v) => {
            const [field, dir] = v.split(':');
            setParams({ sort: field === 'number' && dir === 'desc' ? null : field!, order: dir === 'desc' ? null : dir! });
          }}
          options={
            mobileSorts.some((o) => o.value === `${sort}:${order}`)
              ? mobileSorts
              : [...mobileSorts, { value: `${sort}:${order}`, label: 'Ordenação da tabela' }]
          }
          className="flex-1 md:flex-none lg:hidden"
        />
        <DropdownRoot>
          {/* Só faz sentido com a tabela (no telemóvel a lista é em cartões). */}
          <DropdownTrigger className={buttonClasses('outline', 'md', 'max-lg:hidden')} aria-label="Escolher colunas visíveis">
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
        <Link href="/mapa" className={buttonClasses('outline', 'md', 'max-sm:w-10 max-sm:px-0')} aria-label="Ver os leads no mapa">
          <MapIcon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Mapa</span>
        </Link>
        {prospector ? null : (
        <DropdownRoot>
          {/* Importar e exportar juntos (usa-se pouco: não precisa de lugar no menu lateral). */}
          <DropdownTrigger className={buttonClasses('outline', 'md', 'max-sm:w-10 max-sm:px-0')} aria-label="Importar ou exportar leads">
            <ArrowDownUp className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Importar / Exportar</span>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>Importar</DropdownLabel>
            <DropdownItem onSelect={() => router.push('/importar')}>
              <Upload className="h-4 w-4 text-muted" aria-hidden />
              Folha CSV ou Excel…
            </DropdownItem>
            <DropdownSeparator />
            <DropdownLabel>{activeFilters ? 'Exportar leads filtrados' : 'Exportar todos os leads'}</DropdownLabel>
            <DropdownItem onSelect={() => download('xlsx')}>
              <Download className="h-4 w-4 text-muted" aria-hidden />
              Excel (.xlsx)
            </DropdownItem>
            <DropdownItem onSelect={() => download('csv')}>
              <Download className="h-4 w-4 text-muted" aria-hidden />
              CSV (Excel em português)
            </DropdownItem>
            <DropdownSeparator />
            <DropdownLabel>Arrumar</DropdownLabel>
            <DropdownItem onSelect={() => router.push('/leads/duplicados')}>
              <CopyX className="h-4 w-4 text-muted" aria-hidden />
              Limpar duplicados…
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
        )}
      </div>

      {/* Filtros. Telemóvel: grelha de 2 colunas (sem buracos); a partir do tablet, em linha. */}
      <div
        id="filtros-leads"
        role="group"
        aria-label="Filtros"
        className={cn('gap-2 md:flex md:flex-wrap md:items-end', showFilters ? 'grid grid-cols-2' : 'hidden')}
      >
        <MultiSelectFilter
          label="Setor"
          value={query.sector}
          onChange={(v) => setParams({ sector: v })}
          options={[
            ...(sectors ?? []).map((s) => ({ value: s.id, label: s.name, icon: <SectorIconView sector={s} className="text-muted" /> })),
            { value: 'none', label: 'Sem setor' },
          ]}
        />
        <MultiSelectFilter
          label="Estado"
          value={query.status}
          onChange={(v) => setParams({ status: v })}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label, icon: <StatusIcon status={s} /> }))}
        />
        <MultiSelectFilter
          label="Canal"
          value={query.channel}
          onChange={(v) => setParams({ channel: v })}
          options={[
            ...LEAD_CHANNELS.map((c) => ({ value: c, label: LEAD_CHANNEL_META[c].label, icon: <ChannelIcon channel={c} className="text-muted" /> })),
            { value: 'none', label: 'Sem canal' },
          ]}
        />
        <MultiSelectFilter
          label="Serviço"
          value={query.service}
          onChange={(v) => setParams({ servico: v })}
          options={serviceOptions}
        />
        {tagOptions.length || query.tag.length ? (
          <MultiSelectFilter
            label="Etiqueta"
            value={query.tag}
            onChange={(v) => setParams({ etiqueta: v })}
            options={[...tagOptions, ...query.tag.filter((t) => !tagOptions.some((o) => o.value === t)).map((t) => ({ value: t, label: t }))]}
          />
        ) : null}
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Cidade"
          aria-label="Filtrar por cidade"
          className="max-md:col-span-2 md:w-36"
        />
        <SingleSelectFilter
          label="Próxima ação"
          value={query.due ?? ''}
          onChange={(v) => setParams({ due: v || null })}
          options={DUE_OPTIONS}
          className="max-md:col-span-2"
        />
        {hasTeam ? (
          <SingleSelectFilter
            label="Responsável"
            value={query.assigned ?? ''}
            onChange={(v) => setParams({ resp: v || null })}
            options={[
              { value: '', label: 'Todos os responsáveis' },
              { value: 'me', label: 'Os meus' },
              { value: 'none', label: 'Sem responsável' },
              ...(prospector ? [] : (team ?? []).filter((m) => m.role !== 'owner').map((m) => ({ value: m.user_id, label: m.name }))),
            ]}
            className="max-md:col-span-2"
          />
        ) : null}
        <SingleSelectFilter
          label="Leads arquivados"
          value={query.archived ?? ''}
          onChange={(v) => setParams({ arquivo: v || null })}
          options={ARCHIVE_OPTIONS}
          className="max-md:col-span-2"
        />
        <fieldset className="flex flex-wrap items-center gap-1.5 max-md:col-span-2">
          <legend className="sr-only">Sugerido em</legend>
          <span className="text-sm text-muted max-md:basis-full" aria-hidden>
            Sugerido em
          </span>
          <DateInput
            value={query.suggested_from ?? ''}
            onChange={(v) => setParams({ de: v || null })}
            aria-label="Sugerido desde"
            className="w-auto min-w-0 flex-1 md:w-40 md:flex-none"
          />
          <span className="text-sm text-muted" aria-hidden>
            a
          </span>
          <DateInput
            value={query.suggested_to ?? ''}
            onChange={(v) => setParams({ ate: v || null })}
            aria-label="Sugerido até"
            className="w-auto min-w-0 flex-1 md:w-40 md:flex-none"
          />
        </fieldset>
        {activeFilters ? (
          <Button variant="ghost" onClick={clearFilters} className="max-md:col-span-2 max-md:justify-self-end">
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

      {selected.size ? (
        <div
          role="region"
          aria-label="Ações nos leads selecionados"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-accent/50 bg-surface-2 px-3 py-2 shadow-card lg:top-2"
        >
          <span className="mr-auto text-sm font-medium tabular">
            {selected.size === 1 ? '1 lead selecionado' : `${selected.size} leads selecionados`}
          </span>
          {query.archived === 'only' ? null : (
            <Button size="sm" variant="outline" onClick={() => void runBulk('archive')} loading={bulk.isPending}>
              <Archive className="h-3.5 w-3.5" aria-hidden /> Arquivar
            </Button>
          )}
          {query.archived ? (
            <Button size="sm" variant="outline" onClick={() => void runBulk('restore')} loading={bulk.isPending}>
              <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Repor
            </Button>
          ) : null}
          {hasTeam && !prospector ? (
            <DropdownRoot>
              <DropdownTrigger className={buttonClasses('outline', 'sm')}>
                <UserCheck className="h-3.5 w-3.5" aria-hidden /> Atribuir a…
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabel>Responsável</DropdownLabel>
                {(team ?? []).map((m) => (
                  <DropdownItem key={m.user_id} onSelect={() => void runBulk('assign', m.user_id)}>
                    {m.name}
                  </DropdownItem>
                ))}
                <DropdownSeparator />
                <DropdownItem onSelect={() => void runBulk('assign', null)}>Sem responsável</DropdownItem>
              </DropdownContent>
            </DropdownRoot>
          ) : null}
          <BulkTagMenu rows={selectedRows} onDone={clearSelection} />
          <BulkStatusMenu rows={selectedRows} onDone={clearSelection} />
          <BulkFollowUpMenu rows={selectedRows} onDone={clearSelection} />
          {prospector ? null : (
            <Button size="sm" variant="outline" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Apagar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clearSelection} aria-label="Limpar seleção" title="Limpar seleção">
            <X className="h-3.5 w-3.5" aria-hidden />
            <span className="max-xl:sr-only">Limpar seleção</span>
          </Button>
        </div>
      ) : null}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={selected.size === 1 ? 'Apagar 1 lead?' : `Apagar ${selected.size} leads?`}
        description="Apaga os leads, a linha do tempo e as propostas. Não pode ser desfeito. Se só não os queres ver, arquiva-os; se alguém pediu para ser esquecido (RGPD), usa Anonimizar na ficha do lead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void runBulk('delete')} loading={bulk.isPending}>
              Apagar definitivamente
            </Button>
          </>
        }
      />

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
            {/* Tabela (computador). "relative": os textos só para leitores de ecrã (posição absoluta)
                ficam dentro desta caixa em vez de esticarem a página. */}
            <div className="relative hidden max-h-[calc(100dvh-16rem)] overflow-auto lg:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Leads — clica no nome da empresa para abrir a ficha</caption>
                <thead className="sticky top-0 z-10 bg-surface-2">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      <th scope="col" className="w-10 border-b border-border py-2 pr-1 pl-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => toggleAll(e.target.checked)}
                          aria-label="Selecionar todos os leads desta página"
                          className="h-4 w-4 align-middle"
                        />
                      </th>
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
                      className={cn(
                        'cursor-pointer border-b border-border last:border-0 hover:bg-surface-2',
                        selected.has(row.id) && 'bg-accent-soft hover:bg-accent-soft',
                      )}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a,button,input,label')) return;
                        router.push(leadPath(row.original));
                      }}
                    >
                      <td className="py-2 pr-1 pl-3 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(e) => toggle(row.id, e.target.checked)}
                          aria-label={`Selecionar #${row.original.number} ${row.original.company_name}`}
                          className="mt-0.5 h-4 w-4"
                        />
                      </td>
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

            {/* Cartões (telemóvel e tablet: a tabela tem demasiadas colunas para caber) */}
            <ul className="divide-y divide-border lg:hidden">
              {(data?.data ?? []).map((lead) => (
                <li key={lead.id} className={cn('flex items-start', selected.has(lead.id) && 'bg-accent-soft')}>
                  {/* Caixa fora do link: tocar nela seleciona, tocar no resto abre a ficha. */}
                  <label className="flex shrink-0 cursor-pointer items-center self-stretch py-3 pr-1 pl-4">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={(e) => toggle(lead.id, e.target.checked)}
                      aria-label={`Selecionar #${lead.number} ${lead.company_name}`}
                      className="h-4 w-4"
                    />
                  </label>
                  <Link href={leadPath(lead)} className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 pr-4 pl-2 hover:bg-surface-2">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold">
                        <span className="mr-1.5 text-muted tabular">#{lead.number}</span>
                        {lead.company_name} {lead.project_title ? <span className="font-normal text-muted">· {lead.project_title}</span> : null}
                        {lead.archived_at ? <ArchivedBadge /> : null}
                        <TagChips tags={lead.tags} link={false} className="mt-1 font-normal" />
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={lead.status} />
                        <LeadScoreBadge lead={lead} />
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                      {lead.sector ? (
                        <span className="inline-flex items-center gap-1.5">
                          <SectorIconView sector={lead.sector} />
                          {lead.sector.name}
                        </span>
                      ) : null}
                      {lead.city ? <span>{lead.city}</span> : null}
                      {lead.estimated_value != null ? <span className="tabular">{formatCurrency(lead.estimated_value)}</span> : null}
                    </span>
                    <ServiceIcons services={lead.services} labeled />
                    <TaskProgress progress={lead.task_progress} />
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
