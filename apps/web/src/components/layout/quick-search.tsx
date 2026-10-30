'use client';

/**
 * Pesquisa rápida (Ctrl+K ou ⌘K, ou a lupa no menu): escrever o nome de um
 * lead, projeto, tarefa, texto de uma nota ou chamada, página (também as
 * secções das Definições) ou de um
 * estado, setor, serviço ou etiqueta (abre a lista de leads já filtrada) e
 * saltar logo para lá (setas + Enter). Sem escrever, mostra os leads recentes.
 * Num lead, → (ou "Ações") mostra o que se pode fazer sem abrir a ficha: nova
 * tarefa, registar chamada ou nota, notas com IA, marcar reunião, Pomodoro.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LEAD_STATUSES, LEAD_STATUS_META, formatDate, leadPath, noteSnippet, type Lead, type NoteSearchResult, type TaskSearchResult } from '@vndesign/core';
import {
  ArrowLeft,
  Bookmark,
  BriefcaseBusiness,
  CalendarPlus,
  CheckSquare,
  CircleDot,
  CopyX,
  CornerDownLeft,
  ExternalLink,
  Filter,
  Keyboard,
  Layers,
  ListPlus,
  Loader2,
  Map as MapIcon,
  Phone,
  Search,
  Settings,
  Sparkles,
  Square,
  StickyNote,
  Tag,
  Timer,
  Trash2,
  Upload,
  User,
  UserPlus,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { revealSetting, searchSettingsItems, settingsItemTarget } from '@/components/settings/settings-items';
import { SETTINGS_KEYWORDS, SETTINGS_SECTIONS } from '@/components/settings/settings-nav';
import { useServiceCatalog } from '@/components/services/services';
import { toast } from 'sonner';
import { useLeadTags } from '@/components/leads/tags';
import { useSavedViews } from '@/components/leads/saved-views';
import { DictateButton, appendDictation } from '@/components/ui/dictate-button';
import { api, errorMessage } from '@/lib/api-client';
import { useSectors, useSettings } from '@/lib/queries';
import { readRecentLeads } from '@/lib/recent-leads';
import { PROSPECTOR_SETTINGS } from '@/lib/role-access';
import { cn } from '@/lib/utils';

export type QuickPage = { href: string; label: string; icon: LucideIcon };

type Group = 'Recentes' | 'Ações' | 'Páginas' | 'Vistas guardadas' | 'Filtrar leads' | 'Leads e projetos' | 'Tarefas' | 'Notas e chamadas';
type Item = {
  key: string;
  group: Group;
  label: string;
  hint?: string;
  /** Abre esta página. */
  href?: string;
  icon: LucideIcon;
  done?: boolean;
  /** Lead (→ mostra as ações dele). */
  lead?: LeadRef;
  /** Ação com texto escrito na caixa. */
  compose?: Compose['kind'];
  run?: 'pomodoro' | 'shortcuts';
  keywords?: string;
};

/** Outras palavras com que se procura cada secção das Definições. */

/** Páginas que não estão no menu principal. */
const EXTRA_PAGES: { href: string; label: string; icon: LucideIcon; keywords: string }[] = [
  { href: '/mapa', label: 'Mapa dos leads', icon: MapIcon, keywords: 'mapa localização' },
  { href: '/importar', label: 'Importar leads (Excel/CSV)', icon: Upload, keywords: 'importar excel csv folha' },
  { href: '/equipa?ver=atividade', label: 'Equipa → Atividade', icon: Layers, keywords: 'quem fez o quê histórico atividade' },
  { href: '/leads/apagados', label: 'Leads apagados (reciclagem)', icon: Trash2, keywords: 'apagados reciclagem lixo repor recuperar' },
];

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Atalho do teclado: ⌘K no Mac, Ctrl+K nos outros. */
export function useQuickSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}

/** Texto do atalho para mostrar no botão ("Ctrl K" ou "⌘K"). */
export function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
}

export function QuickSearch({
  open,
  onOpenChange,
  pages,
  tasks,
  prospector,
  onShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: QuickPage[];
  tasks: boolean;
  prospector: boolean;
  onShortcuts?: () => void;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <RadixDialog.Content
          className="fixed top-[8vh] left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card"
          aria-describedby={undefined}
        >
          <RadixDialog.Title className="sr-only">Pesquisa rápida</RadixDialog.Title>
          {/* Montado só aberto: cada vez que abre começa vazio. */}
          <SearchBody pages={pages} tasks={tasks} prospector={prospector} onShortcuts={onShortcuts} onClose={() => onOpenChange(false)} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

type LeadRef = { id: string; number: number; company_name: string; status: Lead['status']; project_title: string | null };
/** Ação com texto (escrito na mesma caixa): tarefa, nota ou chamada. */
type Compose = { kind: 'task' | 'note' | 'call'; lead: LeadRef };

const COMPOSE_META: Record<Compose['kind'], { placeholder: string; required: boolean }> = {
  task: { placeholder: 'Título da tarefa (Enter para criar)', required: true },
  note: { placeholder: 'O que aconteceu? (Enter para registar)', required: true },
  call: { placeholder: 'Como correu a chamada? (opcional, Enter para registar)', required: false },
};

function SearchBody({
  pages,
  tasks,
  prospector,
  onShortcuts,
  onClose,
}: {
  pages: QuickPage[];
  tasks: boolean;
  prospector: boolean;
  onShortcuts?: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const listId = useId();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  // Modo "ações de um lead" (→ ou o botão Ações num lead) e o texto de uma ação.
  const [focus, setFocus] = useState<LeadRef | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent] = useState(() => readRecentLeads());
  const savedViews = useSavedViews();
  const { data: settings } = useSettings();
  const features = settings?.features;

  // Espera um instante depois da última tecla antes de pesquisar.
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  const searching = !focus && !compose && term.length >= 2;
  const leads = useQuery({
    queryKey: ['quick-search', 'leads', term],
    queryFn: ({ signal }) => api<{ data: Lead[] }>('/leads', { query: { q: term, limit: 6 }, signal }).then((r) => r.data),
    enabled: searching,
    staleTime: 30_000,
  });
  const taskResults = useQuery({
    queryKey: ['quick-search', 'tasks', term],
    queryFn: ({ signal }) => api<{ data: TaskSearchResult[] }>('/tasks', { query: { q: term, limit: 6 }, signal }).then((r) => r.data),
    enabled: searching && tasks,
    staleTime: 30_000,
  });

  // O texto das notas e chamadas registadas (não para o prospetor, como as tarefas).
  const noteResults = useQuery({
    queryKey: ['quick-search', 'notes', term],
    queryFn: ({ signal }) => api<{ data: NoteSearchResult[] }>('/notes', { query: { q: term, limit: 5 }, signal }).then((r) => r.data),
    enabled: searching && tasks,
    staleTime: 30_000,
  });

  const { data: sectors } = useSectors();
  const catalog = useServiceCatalog();
  const { data: tagCounts } = useLeadTags();

  const q = normalize(text.trim());
  const matches = (...texts: (string | undefined)[]) => texts.some((t) => t && normalize(t).includes(q));
  const leadItem = (l: LeadRef, group: Group, hint?: string): Item => ({
    key: `${group === 'Recentes' ? 'r' : 'l'}:${l.id}`,
    group,
    label: `#${l.number} ${l.company_name}${l.project_title ? ` · ${l.project_title}` : ''}`,
    hint: hint ?? LEAD_STATUS_META[l.status]?.label,
    href: l.status === 'cliente' ? leadPath(l, '#projeto') : leadPath(l),
    icon: l.status === 'cliente' ? BriefcaseBusiness : User,
    lead: l,
  });

  let items: Item[];
  if (focus) {
    // Ações de um lead.
    const path = (sub = '') => `${leadPath(focus)}${sub}`;
    const pomodoroOn = !prospector && focus.status === 'cliente' && features?.projects && features.time_tracking && features.pomodoro;
    const actions: Item[] = [
      { key: 'a:abrir', group: 'Ações', label: 'Abrir a ficha', href: path(), icon: ExternalLink },
      { key: 'a:tarefa', group: 'Ações', label: 'Nova tarefa…', icon: ListPlus, compose: 'task' },
      { key: 'a:chamada', group: 'Ações', label: 'Registar chamada…', icon: Phone, compose: 'call' },
      { key: 'a:nota', group: 'Ações', label: 'Registar nota…', icon: StickyNote, compose: 'note' },
      { key: 'a:resumo', group: 'Ações', label: 'Resumo com IA (antes de ligar)', href: path('?acao=resumo'), icon: Sparkles },
      { key: 'a:notas-ia', group: 'Ações', label: 'Notas com IA (resumo de reunião)', href: path('?acao=notas'), icon: Sparkles },
      ...(features?.meetings !== false ? [{ key: 'a:reuniao', group: 'Ações' as const, label: 'Marcar reunião', href: path('?acao=reuniao'), icon: CalendarPlus }] : []),
      ...(pomodoroOn ? [{ key: 'a:pomodoro', group: 'Ações' as const, label: 'Começar Pomodoro', icon: Timer, run: 'pomodoro' as const }] : []),
    ];
    items = actions.filter((a) => !q || normalize(a.label).includes(q));
  } else if (compose) {
    items = [];
  } else {
    // Ações gerais (ao escrever).
    const general: Item[] = q
      ? [
          { key: 'g:novo-lead', group: 'Ações' as const, label: 'Novo lead', href: '/leads/novo', icon: UserPlus, keywords: 'criar adicionar lead empresa' },
          ...(prospector ? [] : [{ key: 'g:duplicados', group: 'Ações' as const, label: 'Limpar duplicados', href: '/leads/duplicados', icon: CopyX, keywords: 'repetidos juntar duplicados' }]),
          ...(onShortcuts ? [{ key: 'g:atalhos', group: 'Ações' as const, label: 'Atalhos de teclado', run: 'shortcuts' as const, icon: Keyboard, keywords: 'teclado atalhos teclas' }] : []),
        ].filter((a) => matches(a.label, a.keywords))
      : [];
    // Secções das Definições e outras páginas (só ao escrever).
    const morePages: Item[] = q
      ? [
          ...SETTINGS_SECTIONS.filter((sec) => !prospector || PROSPECTOR_SETTINGS.has(sec.slug))
            .filter((sec) => matches(sec.label, SETTINGS_KEYWORDS[sec.slug]))
            .map((sec) => ({ key: `s:${sec.slug}`, group: 'Páginas' as const, label: `Definições → ${sec.label}`, href: `/definicoes/${sec.slug}`, icon: Settings })),
          // Opções soltas das Definições ("Tempo em dinheiro", "Limite por dia"…).
          ...searchSettingsItems(text, new Set(SETTINGS_SECTIONS.filter((sec) => !prospector || PROSPECTOR_SETTINGS.has(sec.slug)).map((sec) => sec.slug)), 4).map((it) => {
            const target = settingsItemTarget(it, features);
            const section = SETTINGS_SECTIONS.find((sec) => sec.slug === it.slug)!;
            return {
              key: `so:${it.id}`,
              group: 'Páginas' as const,
              label: `Definições → ${section.label} → ${it.label}`,
              hint: target.missing ? `liga primeiro “${target.missing}”` : undefined,
              href: target.href,
              icon: Settings,
            };
          }),
          ...(prospector ? [] : EXTRA_PAGES)
            .filter((p) => matches(p.label, p.keywords))
            .map((p) => ({ key: `x:${p.href}`, group: 'Páginas' as const, label: p.label, href: p.href, icon: p.icon })),
        ]
      : [];
    // Estado, setor, serviço ou etiqueta: a lista de leads já filtrada.
    const filters: Item[] =
      q.length >= 2
        ? [
            ...LEAD_STATUSES.filter((st) => matches(LEAD_STATUS_META[st].label)).map((st) => ({
              key: `fs:${st}`,
              group: 'Filtrar leads' as const,
              label: `Leads em “${LEAD_STATUS_META[st].label}”`,
              hint: 'Estado',
              href: `/leads?status=${st}`,
              icon: CircleDot,
            })),
            ...(sectors ?? [])
              .filter((sec) => matches(sec.name))
              .slice(0, 4)
              .map((sec) => ({ key: `fc:${sec.id}`, group: 'Filtrar leads' as const, label: `Leads do setor “${sec.name}”`, hint: 'Setor', href: `/leads?sector=${sec.id}`, icon: Filter })),
            ...catalog.active
              .filter((sv) => matches(sv.label))
              .slice(0, 4)
              .map((sv) => ({ key: `fv:${sv.key}`, group: 'Filtrar leads' as const, label: `Leads interessados em “${sv.label}”`, hint: 'Serviço', href: `/leads?servico=${sv.key}`, icon: Filter })),
            ...(tagCounts ?? [])
              .filter((t) => matches(t.tag))
              .slice(0, 4)
              .map((t) => ({
                key: `ft:${t.tag}`,
                group: 'Filtrar leads' as const,
                label: `Leads com a etiqueta “${t.tag}”`,
                hint: `Etiqueta · ${t.count} lead${t.count === 1 ? '' : 's'}`,
                href: `/leads?etiqueta=${encodeURIComponent(t.tag)}`,
                icon: Tag,
              })),
          ]
        : [];
    // Vistas guardadas na lista de leads (sem escrever: todos; a escrever: os que coincidem).
    const views: Item[] = savedViews
      .filter((v) => !q || matches(v.name))
      .slice(0, q ? 4 : 5)
      .map((v) => ({ key: `v:${v.id}`, group: 'Vistas guardadas' as const, label: v.name, hint: 'Lista de leads', href: `/leads?${v.query}`, icon: Bookmark }));
    items = [
      ...(q ? [] : recent.slice(0, 5).map((l) => leadItem(l, 'Recentes'))),
      ...(q ? [] : views),
      ...general,
      ...pages
        .filter((p) => !q || normalize(p.label).includes(q))
        .slice(0, q ? 4 : pages.length)
        .map((p) => ({ key: `p:${p.href}`, group: 'Páginas' as const, label: p.label, href: p.href, icon: p.icon })),
      ...morePages.slice(0, 5),
      ...(q ? views : []),
      ...filters,
      ...(searching ? (leads.data ?? []).map((l) => leadItem({ ...l, project_title: l.project_title ?? null }, 'Leads e projetos', [LEAD_STATUS_META[l.status]?.label, l.city].filter(Boolean).join(' · '))) : []),
      ...(searching && tasks
        ? (taskResults.data ?? []).map((t) => ({
            key: `t:${t.id}`,
            group: 'Tarefas' as const,
            label: t.title,
            hint: `#${t.lead.number} ${t.lead.company_name}${t.done_at ? ' · concluída' : ''}`,
            href: leadPath(t.lead, '#tarefas'),
            icon: t.done_at ? CheckSquare : Square,
            done: !!t.done_at,
          }))
        : []),
      ...(searching && tasks
        ? (noteResults.data ?? []).map((n) => ({
            key: `n:${n.id}`,
            group: 'Notas e chamadas' as const,
            label: noteSnippet(n.body, term, 40),
            hint: `#${n.lead.number} ${n.lead.company_name} · ${n.type === 'call_logged' ? 'Chamada' : n.type === 'comment' ? 'Comentário da equipa' : 'Nota'} de ${formatDate(n.created_at)}`,
            href: leadPath(n.lead, '#atividade'),
            icon: n.type === 'call_logged' ? Phone : n.type === 'comment' ? MessagesSquare : StickyNote,
          }))
        : []),
    ];
  }
  const current = Math.min(active, Math.max(0, items.length - 1));
  const loading = busy || (searching && (leads.isFetching || (tasks && (taskResults.isFetching || noteResults.isFetching))));

  function enterLead(lead: LeadRef) {
    setFocus(lead);
    setText('');
    setActive(0);
  }

  function back() {
    if (compose) {
      setFocus(compose.lead);
      setCompose(null);
    } else {
      setFocus(null);
    }
    setText('');
    setActive(0);
  }

  async function runPomodoro(lead: LeadRef) {
    setBusy(true);
    try {
      const { data } = await api<{ data: unknown }>('/pomodoro', { method: 'POST', body: { lead_id: lead.id } });
      qc.setQueryData(['pomodoro'], data);
      void qc.invalidateQueries({ queryKey: ['time'] });
      toast.success(`Pomodoro a contar em ${lead.company_name}.`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitCompose() {
    if (!compose || busy) return;
    const value = text.trim();
    if (COMPOSE_META[compose.kind].required && !value) return;
    setBusy(true);
    try {
      if (compose.kind === 'task') {
        await api(`/leads/${compose.lead.id}/tasks`, { method: 'POST', body: { title: value } });
        void qc.invalidateQueries({ queryKey: ['tasks', compose.lead.id] });
        void qc.invalidateQueries({ queryKey: ['today'] });
        toast.success(`Tarefa criada em ${compose.lead.company_name}.`);
      } else {
        await api(`/leads/${compose.lead.id}/activities`, {
          method: 'POST',
          body: { type: compose.kind === 'call' ? 'call_logged' : 'note', body: value || undefined },
        });
        toast.success(`${compose.kind === 'call' ? 'Chamada' : 'Nota'} registada em ${compose.lead.company_name}.`);
      }
      void qc.invalidateQueries({ queryKey: ['activities', compose.lead.id] });
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function go(item: Item | undefined) {
    if (!item) return;
    if (item.compose && focus) {
      setCompose({ kind: item.compose, lead: focus });
      setFocus(null);
      setText('');
      return;
    }
    if (item.run === 'pomodoro' && focus) {
      void runPomodoro(focus);
      return;
    }
    if (item.run === 'shortcuts') {
      onClose();
      onShortcuts?.();
      return;
    }
    if (!item.href) return;
    onClose();
    router.push(item.href);
    if (item.href.startsWith('/definicoes/') && item.href.includes('#')) revealSetting(item.href.split('#')[1]);
  }

  const placeholder = compose
    ? COMPOSE_META[compose.kind].placeholder
    : focus
      ? `Ações para #${focus.number} ${focus.company_name}…`
      : 'Pesquisar leads, projetos, tarefas…';
  const context = compose ?? (focus ? { lead: focus } : null);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3">
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden /> : <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
        {context ? (
          <button
            type="button"
            onClick={back}
            className="inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent-text"
            aria-label="Voltar"
            title="Voltar (ou apaga com ⌫)"
          >
            <ArrowLeft className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">
              #{context.lead.number} {context.lead.company_name}
              {compose ? ` · ${compose.kind === 'task' ? 'tarefa' : compose.kind === 'call' ? 'chamada' : 'nota'}` : ''}
            </span>
          </button>
        ) : null}
        <input
          autoFocus
          role="combobox"
          aria-expanded={!compose}
          aria-controls={listId}
          aria-activedescendant={!compose && items[current] ? `${listId}-${current}` : undefined}
          aria-label={compose ? placeholder : 'Pesquisar leads, projetos, tarefas e páginas'}
          placeholder={placeholder}
          value={text}
          maxLength={compose ? 300 : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !text && context) {
              e.preventDefault();
              back();
            } else if (compose) {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitCompose();
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((current + 1) % Math.max(1, items.length));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((current - 1 + items.length) % Math.max(1, items.length));
            } else if ((e.key === 'ArrowRight' || e.key === 'Tab') && items[current]?.lead && !focus) {
              // → num lead: as ações desse lead.
              e.preventDefault();
              enterLead(items[current]!.lead!);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              go(items[current]);
            }
          }}
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
        {compose ? <DictateButton size="sm" onText={(spoken) => setText((current) => appendDictation(current, spoken).slice(0, 300))} /> : null}
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[11px] text-muted sm:inline">Esc</kbd>
      </div>
      {compose ? (
        <p className="px-4 py-3 text-xs text-muted">
          {compose.kind === 'task' ? 'Fica na lista de tarefas da ficha, sem prazo (podes pôr depois).' : 'Fica na linha do tempo da ficha.'} Enter para gravar · ⌫ para voltar.
        </p>
      ) : (
        <ul id={listId} role="listbox" aria-label="Resultados" className="flex-1 overflow-y-auto p-2">
          {items.map((item, i) => {
            const header = i === 0 || items[i - 1]!.group !== item.group ? item.group : null;
            const Icon = item.icon;
            const selected = i === current;
            return (
              <li key={item.key} role="presentation">
                {header ? (
                  <p className="px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase" role="presentation">
                    {header}
                  </p>
                ) : null}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => !selected && setActive(i)}
                  onClick={() => go(item)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm', selected ? 'bg-accent-soft text-accent-text' : 'text-fg')}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', selected ? 'text-accent-text' : 'text-muted')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', item.done && 'line-through opacity-70')}>{item.label}</span>
                    {item.hint ? <span className="block truncate text-xs text-muted">{item.hint}</span> : null}
                  </span>
                  {item.lead && !focus ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        enterLead(item.lead!);
                      }}
                      className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-medium hover:bg-surface-2', selected ? 'text-accent-text' : 'text-muted')}
                      aria-label={`Ações para ${item.label}`}
                      title="Ações (→)"
                    >
                      Ações ›
                    </button>
                  ) : selected ? (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : null}
                </div>
              </li>
            );
          })}
          {searching && !loading && items.length === 0 ? <li className="px-2 py-6 text-center text-sm text-muted">Nada encontrado para “{term}”.</li> : null}
          {!searching && !focus && text.trim().length === 1 ? <li className="px-2 py-2 text-xs text-muted">Escreve mais uma letra para procurar leads, tarefas e notas.</li> : null}
          {!focus && items.some((it) => it.lead) ? (
            <li className="hidden px-2 pt-2 text-[11px] text-muted pointer-fine:block" role="presentation">
              → num lead: criar tarefa, registar chamada ou nota, marcar reunião…
            </li>
          ) : null}
        </ul>
      )}
    </>
  );
}
