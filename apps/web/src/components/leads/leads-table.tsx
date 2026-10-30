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
  LOST_REASONS,
  LOST_REASON_LABELS,
  addDays,
  formatCurrency,
  formatDate,
  todayIso,
  type Lead,
  type LeadArchiveFilter,
  type LeadBulkAction,
  type LeadSortField,
  leadPath,
} from '@vndesign/core';
import { Archive, ArchiveRestore, ArrowDown, ArrowDownUp, ArrowUp, ArrowUpDown, Columns3, CopyX, Download, Search, SlidersHorizontal, Trash2, Upload, UserCheck, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useDebouncedValue, useHydrated } from '@/lib/hooks';
import { bulkResultMessage, useBulkLeadAction, usePreference, useLeadCities, useLeads, useRole, useSectors, useSetPreference, useTeamNames } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { ChannelLabel, MobileLabel, PageSpeedScore, StatusBadge } from './badges';
import { LeadScoreBadge } from './lead-score';
import { MultiSelectFilter, SingleSelectFilter } from './multi-select';
import { BulkFollowUpMenu, BulkStatusMenu, BulkTagMenu } from './bulk-actions';
import { customFilterOptions, useCustomFields } from './custom-fields';
import { rememberLeadList } from './lead-pager';
import { SavedViewsMenu } from './saved-views';
import { ViewSwitch } from './view-switch';
import { restoreDeletedLeads } from './trash-view';
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
  { value: 'none', label: 'Sem próximo passo (em conversa)' },
];

const STALE_OPTIONS = [
  { value: '', label: 'Qualquer tempo na fase' },
  { value: '7', label: 'Na fase há mais de 7 dias' },
  { value: '14', label: 'Na fase há mais de 14 dias' },
  { value: '30', label: 'Na fase há mais de 30 dias' },
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

/** Os filtros da lista a partir do endereço (?status=…&city=…); também para exportar. */
export function leadFiltersFromParams(params: { get(name: string): string | null }) {
  const get = (k: string) => params.get(k) ?? '';
  const getList = (k: string) => get(k).split(',').filter(Boolean);
  return {
    q: get('q') || undefined,
    sector: getList('sector'),
    status: getList('status'),
    channel: getList('channel'),
    service: getList('servico'),
    tag: getList('etiqueta'),
    cf: getList('cf'),
    lost: getList('motivo'),
    stale: get('parado') ? Number(get('parado')) : undefined,
    city: get('city') || undefined,
    due: get('due') || undefined,
    suggested_from: get('de') || undefined,
    suggested_to: get('ate') || undefined,
    archived: (get('arquivo') || undefined) as LeadArchiveFilter | undefined,
    assigned: get('resp') || undefined,
  };
}

/** Topo da página: quantos leads há e quantos estão por contactar. */
export function LeadsSummary() {
  const { data: all } = useLeads({ limit: 1 });
  const { data: fresh } = useLeads({ status: ['identificado'], limit: 1 });
  if (!all) return <>Os teus leads de prospeção.</>;
  const n = all.meta.total;
  return (
    <>
      {n} lead{n === 1 ? '' : 's'}
      {fresh ? ` · ${fresh.meta.total} por contactar` : ''}
    </>
  );
}

/** Ações da lista (ao lado de "Novo lead"): importar, exportar (com os filtros atuais) e arrumar. */
export function LeadsPageActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prospector = useRole() === 'prospector';
  if (prospector) return null;
  const filters = leadFiltersFromParams(searchParams);
  const filtered = Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v));
  /** Descarrega o ficheiro com os filtros atuais (a API devolve-o como anexo). */
  function download(format: 'csv' | 'xlsx') {
    const a = document.createElement('a');
    a.href = `/api/v1/leads/export${toQueryString({ ...filters, format })}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return (
    <DropdownRoot>
      {/* Importar e exportar juntos (usa-se pouco: não precisa de lugar no menu lateral). */}
      <DropdownTrigger className={buttonClasses('outline', 'md', 'max-sm:w-10 max-sm:px-0')} aria-label="Importar / Exportar leads">
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
        <DropdownLabel>{filtered ? 'Exportar leads filtrados' : 'Exportar todos os leads'}</DropdownLabel>
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
        <DropdownItem onSelect={() => router.push('/leads/apagados')}>
          <Trash2 className="h-4 w-4 text-muted" aria-hidden />
          Apagados (reciclagem)…
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}

/** Atalhos de "Sugerido em" (de… a…), com a semana de segunda a domingo. */
function suggestedPresets(today: string) {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return [
    { label: 'Esta semana', from: addDays(today, -weekday), to: today },
    { label: 'Este mês', from: `${today.slice(0, 8)}01`, to: today },
    { label: 'Últimos 30 dias', from: addDays(today, -29), to: today },
  ];
}

/** A tabela só se desenha no browser (os filtros e colunas dependem de dados em cache). */
export function LeadsTable() {
  return useHydrated() ? (
    <LeadsTableView />
  ) : (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function LeadsTableView() {
  const router = useRouter();
  const serviceOptions = useServiceFilterOptions();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = todayIso();

  const get = (k: string) => searchParams.get(k) ?? '';
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
  // Ao abrir uma vista ou limpar os filtros, o endereço muda primeiro: até lá, a pesquisa não o reescreve
  // (senão, com a navegação lenta, voltava a pôr os filtros antigos ou tirava os novos).
  const pendingUrl = useRef<string | null>(null);
  useEffect(() => {
    if (pendingUrl.current === searchParams.toString()) pendingUrl.current = null;
  }, [searchParams]);
  useEffect(() => {
    if (pendingUrl.current !== null) {
      if (searchParams.toString() !== pendingUrl.current) return;
      pendingUrl.current = null;
    }
    if (debouncedSearch !== get('q') || debouncedCity !== get('city')) {
      setParams({ q: debouncedSearch.trim() || null, city: debouncedCity.trim() || null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, debouncedCity]);

  const query = {
    ...leadFiltersFromParams(searchParams),
    sort,
    order,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, isFetching, error } = useLeads(query);
  // A ficha mostra ← → para o lead seguinte desta lista (com estes filtros e ordem).
  useEffect(() => {
    if (data) rememberLeadList(query, data.meta.total, data.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const { data: sectors } = useSectors();
  const tagOptions = useTagFilterOptions();
  const { data: customFields } = useCustomFields();
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
    query.sector.length + query.status.length + query.channel.length + query.service.length + query.tag.length + query.cf.length + query.lost.length +
    [query.q, query.city, query.due, query.stale, query.suggested_from, query.suggested_to, query.archived, query.assigned].filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(false);
  // Mais filtros: aberto quando um deles está ativo (ex.: ao abrir uma vista guardada).
  const advancedActive =
    query.sector.length + query.channel.length + query.cf.length + query.lost.length +
    [query.city, query.due, query.stale, query.suggested_from, query.suggested_to, query.archived].filter(Boolean).length;
  const [showMore, setShowMore] = useState<boolean | null>(null);
  const moreOpen = showMore ?? advancedActive > 0;
  const { data: cities } = useLeadCities();
  const assignedOptions = [
    { value: '', label: 'Todos os responsáveis' },
    { value: 'me', label: 'Os meus' },
    { value: 'none', label: 'Sem responsável' },
    ...(prospector ? [] : (team ?? []).filter((m) => m.role !== 'owner').map((m) => ({ value: m.user_id, label: m.name }))),
  ];

  // Uma etiqueta por filtro ativo (nome e valor), para tirar só esse.
  const optionLabel = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v)?.label ?? v;
  const without = (list: string[], v: string) => list.filter((x) => x !== v);
  const chips: { key: string; name: string; value: string; remove: () => void }[] = [
    ...(query.q
      ? [
          {
            key: 'q',
            name: 'Pesquisa',
            value: query.q,
            remove: () => {
              setSearch('');
              setParams({ q: null });
            },
          },
        ]
      : []),
    ...query.status.map((v) => ({
      key: `status-${v}`,
      name: 'Estado',
      value: LEAD_STATUS_META[v as keyof typeof LEAD_STATUS_META]?.label ?? v,
      remove: () => setParams({ status: without(query.status, v) }),
    })),
    ...query.service.map((v) => ({ key: `svc-${v}`, name: 'Serviço', value: optionLabel(serviceOptions, v), remove: () => setParams({ servico: without(query.service, v) }) })),
    ...query.tag.map((v) => ({ key: `tag-${v}`, name: 'Etiqueta', value: v, remove: () => setParams({ etiqueta: without(query.tag, v) }) })),
    ...(query.assigned ? [{ key: 'resp', name: 'Responsável', value: optionLabel(assignedOptions, query.assigned), remove: () => setParams({ resp: null }) }] : []),
    ...query.sector.map((v) => ({
      key: `sector-${v}`,
      name: 'Setor',
      value: v === 'none' ? 'Sem setor' : (sectors?.find((x) => x.id === v)?.name ?? v),
      remove: () => setParams({ sector: without(query.sector, v) }),
    })),
    ...query.channel.map((v) => ({
      key: `ch-${v}`,
      name: 'Canal',
      value: v === 'none' ? 'Sem canal' : (LEAD_CHANNEL_META[v as keyof typeof LEAD_CHANNEL_META]?.label ?? v),
      remove: () => setParams({ channel: without(query.channel, v) }),
    })),
    ...(query.city
      ? [
          {
            key: 'city',
            name: 'Cidade',
            value: query.city,
            remove: () => {
              setCity('');
              setParams({ city: null });
            },
          },
        ]
      : []),
    ...query.cf.map((v) => {
      const [key = '', ...rest] = v.split(':');
      const field = customFields?.find((f) => f.key === key);
      const value = rest.join(':');
      return {
        key: `cf-${v}`,
        name: field?.label ?? key,
        value: field ? optionLabel(customFilterOptions(field), value) : value,
        remove: () => setParams({ cf: without(query.cf, v) }),
      };
    }),
    ...query.lost.map((v) => ({
      key: `lost-${v}`,
      name: 'Motivo',
      value: v === 'none' ? 'Sem motivo' : (LOST_REASON_LABELS[v as keyof typeof LOST_REASON_LABELS] ?? v),
      remove: () => setParams({ motivo: without(query.lost, v) }),
    })),
    ...(query.due ? [{ key: 'due', name: 'Próxima ação', value: optionLabel(DUE_OPTIONS, query.due), remove: () => setParams({ due: null }) }] : []),
    ...(query.stale ? [{ key: 'stale', name: 'Fase', value: optionLabel(STALE_OPTIONS, String(query.stale)), remove: () => setParams({ parado: null }) }] : []),
    ...(query.suggested_from || query.suggested_to
      ? [
          {
            key: 'sug',
            name: 'Sugerido',
            value: [query.suggested_from ? `de ${formatDate(query.suggested_from)}` : null, query.suggested_to ? `a ${formatDate(query.suggested_to)}` : null]
              .filter(Boolean)
              .join(' '),
            remove: () => setParams({ de: null, ate: null }),
          },
        ]
      : []),
    ...(query.archived ? [{ key: 'arq', name: 'Arquivo', value: optionLabel(ARCHIVE_OPTIONS, query.archived), remove: () => setParams({ arquivo: null }) }] : []),
  ];

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
  const qc = useQueryClient();
  const invalidateAll = () => {
    for (const key of ['leads', 'lead', 'board', 'today', 'lead-trash']) void qc.invalidateQueries({ queryKey: [key] });
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function runBulk(action: LeadBulkAction, assignedTo?: string | null) {
    const ids = [...selected];
    try {
      const result = await bulk.mutateAsync({ action, ids, ...(action === 'assign' ? { assigned_to: assignedTo ?? null } : {}) });
      clearSelection();
      setConfirmDelete(false);
      const undo = action === 'archive' ? 'restore' : action === 'restore' ? 'archive' : null;
      if (action === 'delete') {
        // Foram para a reciclagem: "Anular" repõe-nos (também em Leads → Apagados, 30 dias).
        toast.success(`${bulkResultMessage(result).replace(/\.$/, '')} (ficam 30 dias em Apagados).`, {
          action: {
            label: 'Anular',
            onClick: () =>
              void restoreDeletedLeads(ids).then(
                (n) => {
                  invalidateAll();
                  toast.success(n === 1 ? '1 lead reposto.' : `${n} leads repostos.`);
                },
                (e: unknown) => toast.error(errorMessage(e)),
              ),
          },
        });
        return;
      }
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

  function clearFilters() {
    pendingUrl.current = '';
    setSearch('');
    setCity('');
    router.replace(pathname, { scroll: false });
  }

  const total = data?.meta.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:[&>*]:shrink-0">
      {/* Pesquisa · Vistas · Tabela/Mapa (telemóvel: Filtros e Ordenar por baixo). */}
      <div className="flex flex-wrap items-center gap-2">
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
          className={cn('md:hidden', activeFilters && 'border-accent/60 text-accent-text')}
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
        <SavedViewsMenu
          params={new URLSearchParams(searchParams.toString())}
          onApply={(qs) => {
            const next = new URLSearchParams(qs);
            pendingUrl.current = next.toString();
            setSearch(next.get('q') ?? '');
            setCity(next.get('city') ?? '');
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
          }}
        />
        {/* A mesma lista vista de outra forma (os filtros passam para o Kanban). */}
        <ViewSwitch current="lista" />
      </div>

      {/* Filtros principais (sempre à vista no computador) · Mais filtros · Colunas. */}
      <div
        id="filtros-leads"
        role="group"
        aria-label="Filtros"
        className={cn('gap-2 md:flex md:flex-wrap md:items-center', showFilters ? 'grid grid-cols-2' : 'hidden')}
      >
        <MultiSelectFilter
          label="Estado"
          value={query.status}
          onChange={(v) => setParams({ status: v })}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label, icon: <StatusIcon status={s} /> }))}
        />
        <MultiSelectFilter label="Serviço" value={query.service} onChange={(v) => setParams({ servico: v })} options={serviceOptions} />
        {tagOptions.length || query.tag.length ? (
          <MultiSelectFilter
            label="Etiqueta"
            value={query.tag}
            onChange={(v) => setParams({ etiqueta: v })}
            options={[...tagOptions, ...query.tag.filter((t) => !tagOptions.some((o) => o.value === t)).map((t) => ({ value: t, label: t }))]}
          />
        ) : null}
        {hasTeam ? (
          <SingleSelectFilter
            label="Responsável"
            value={query.assigned ?? ''}
            onChange={(v) => setParams({ resp: v || null })}
            options={assignedOptions}
          />
        ) : null}
        <Button
          variant="outline"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={moreOpen}
          aria-controls="mais-filtros"
          className={cn('max-md:hidden', advancedActive && 'border-accent/60 bg-accent-soft text-fg')}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Mais filtros{advancedActive ? ` (${advancedActive})` : ''}
        </Button>
        <DropdownRoot>
          {/* Só faz sentido com a tabela (no telemóvel a lista é em cartões). */}
          <DropdownTrigger className={buttonClasses('ghost', 'md', 'ml-auto max-lg:hidden')} aria-label="Escolher colunas visíveis">
            <Columns3 className="h-4 w-4" aria-hidden />
            Colunas
          </DropdownTrigger>
          <DropdownContent align="end">
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
      </div>

      {/* Mais filtros, por grupos (no telemóvel aparecem com o botão Filtros). */}
      {moreOpen || showFilters ? (
        <div
          id="mais-filtros"
          role="group"
          aria-label="Mais filtros"
          className={cn('grid gap-4 rounded-xl border border-border bg-surface p-3 md:grid-cols-3', !moreOpen && 'md:hidden')}
        >
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Lead</legend>
            <MultiSelectFilter
              label="Setor"
              value={query.sector}
              onChange={(v) => setParams({ sector: v })}
              options={[
                ...(sectors ?? []).map((s) => ({ value: s.id, label: s.name, icon: <SectorIconView sector={s} className="text-muted" /> })),
                { value: 'none', label: 'Sem setor' },
              ]}
              className="w-full"
            />
            <MultiSelectFilter
              label="Canal"
              value={query.channel}
              onChange={(v) => setParams({ channel: v })}
              options={[
                ...LEAD_CHANNELS.map((c) => ({ value: c, label: LEAD_CHANNEL_META[c].label, icon: <ChannelIcon channel={c} className="text-muted" /> })),
                { value: 'none', label: 'Sem canal' },
              ]}
              className="w-full"
            />
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Cidade"
              aria-label="Filtrar por cidade"
              list="cidades-leads"
              className={cn(city && 'border-accent/60 bg-accent-soft')}
            />
            <datalist id="cidades-leads">
              {(cities ?? []).map((c) => (
                <option key={c.city} value={c.city}>{`${c.count} lead${c.count === 1 ? '' : 's'}`}</option>
              ))}
            </datalist>
            {(customFields ?? [])
              .filter((f) => f.type === 'choice' || f.type === 'yes_no')
              .map((f) => {
                const prefix = `${f.key}:`;
                return (
                  <MultiSelectFilter
                    key={f.id}
                    label={f.label}
                    value={query.cf.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length))}
                    onChange={(v) => setParams({ cf: [...query.cf.filter((c) => !c.startsWith(prefix)), ...v.map((x) => prefix + x)] })}
                    options={customFilterOptions(f)}
                    className="w-full"
                  />
                );
              })}
            {/* Motivo de "Sem interesse": só quando se veem esses leads (ou o filtro já está ativo). */}
            {query.status.includes('sem_interesse') || query.lost.length ? (
              <MultiSelectFilter
                label="Motivo"
                value={query.lost}
                onChange={(v) => setParams({ motivo: v })}
                options={[...LOST_REASONS.map((r) => ({ value: r, label: LOST_REASON_LABELS[r] })), { value: 'none', label: 'Sem motivo' }]}
                className="w-full"
              />
            ) : null}
          </fieldset>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Datas</legend>
            <SingleSelectFilter label="Próxima ação" value={query.due ?? ''} onChange={(v) => setParams({ due: v || null })} options={DUE_OPTIONS} className="w-full" />
            <SingleSelectFilter
              label="Na fase há"
              value={query.stale ? String(query.stale) : ''}
              onChange={(v) => setParams({ parado: v || null })}
              options={STALE_OPTIONS}
              className="w-full"
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Sugerido em</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestedPresets(today).map((p) => {
                  const on = query.suggested_from === p.from && query.suggested_to === p.to;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setParams(on ? { de: null, ate: null } : { de: p.from, ate: p.to })}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium',
                        on ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:text-fg',
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <DateInput
                  value={query.suggested_from ?? ''}
                  onChange={(v) => setParams({ de: v || null })}
                  aria-label="Sugerido desde"
                  className="min-w-0 flex-1"
                />
                <span className="text-sm text-muted" aria-hidden>
                  a
                </span>
                <DateInput value={query.suggested_to ?? ''} onChange={(v) => setParams({ ate: v || null })} aria-label="Sugerido até" className="min-w-0 flex-1" />
              </div>
            </div>
          </fieldset>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Arquivo</legend>
            <SingleSelectFilter
              label="Leads arquivados"
              value={query.archived ?? ''}
              onChange={(v) => setParams({ arquivo: v || null })}
              options={ARCHIVE_OPTIONS}
              className="w-full"
            />
            <p className="text-xs text-muted">Os arquivados saem da lista, do Kanban e da prospeção, mas não se perdem.</p>
          </fieldset>
        </div>
      ) : null}

      {/* O que está filtrado (cada um sai com ✕) e quantos leads há. */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <p className="mr-1 text-muted" role="status" aria-live="polite">
          {isLoading ? 'A carregar leads…' : `${total} lead${total === 1 ? '' : 's'}${activeFilters ? ' com estes filtros' : ''}`}
          {isFetching && !isLoading ? ' · a atualizar…' : ''}
        </p>
        {chips.map((c) => (
          <span key={c.key} className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/40 bg-accent-soft py-0.5 pr-1 pl-2.5 text-xs">
            <span className="truncate">
              <span className="text-muted">{c.name}:</span> {c.value}
            </span>
            <button
              type="button"
              onClick={c.remove}
              aria-label={`Tirar o filtro ${c.name}: ${c.value}`}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-fg"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        {activeFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        ) : null}
      </div>

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
        description="Vão para Leads → Apagados com tudo o que têm e podes repô-los durante 30 dias; depois saem de vez. Se só não os queres ver, arquiva-os; se alguém pediu para ser esquecido (RGPD), usa Anonimizar na ficha do lead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void runBulk('delete')} loading={bulk.isPending}>
              Apagar
            </Button>
          </>
        }
      />

      {/* Computador: a caixa encolhe para caber no ecrã (a tabela tem o seu scroll). */}
      {/* Com leads: cada um no seu cartão (sem caixa à volta); a carregar ou vazio: uma caixa. */}
      <div
        className={cn(
          'transition-opacity lg:flex lg:min-h-0 lg:!shrink lg:flex-col',
          isLoading || table.getRowModel().rows.length === 0 ? 'rounded-xl border border-border bg-surface' : '',
          isFetching && !isLoading && 'opacity-70',
        )}
      >
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
            <div className="relative hidden min-h-0 overflow-auto scroll-thin lg:block">
              {/* Linhas separadas (como cartões): border-separate com espaço entre as linhas. */}
              <table className="w-full border-separate border-spacing-x-0 border-spacing-y-2 text-sm">
                <caption className="sr-only">Leads — clica no nome da empresa para abrir a ficha</caption>
                <thead className="sticky top-0 z-10 bg-bg">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      <th scope="col" className="w-10 py-2 pr-1 pl-3">
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
                              'px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase',
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
                        'group cursor-pointer',
                        // Cada linha é um cartão: fundo e contorno nas células (bordas só por fora, cantos redondos nas pontas).
                        '[&>td]:border-y [&>td]:border-border [&>td]:bg-surface [&>td]:transition-colors hover:[&>td]:bg-surface-2',
                        '[&>td:first-child]:rounded-l-xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-xl [&>td:last-child]:border-r',
                        selected.has(row.id) && '[&>td]:bg-accent-soft hover:[&>td]:bg-accent-soft',
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
            <ul className="flex flex-col gap-3 lg:hidden">
              {(data?.data ?? []).map((lead) => (
                <li
                  key={lead.id}
                  className={cn('flex items-start overflow-hidden rounded-xl border border-border bg-surface shadow-card', selected.has(lead.id) && 'bg-accent-soft')}
                >
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
