'use client';

/**
 * Pesquisa rápida (Ctrl+K ou ⌘K, ou a lupa no menu): escrever o nome de um
 * lead, projeto, tarefa ou página e saltar logo para lá (setas + Enter).
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { LEAD_STATUS_META, leadPath, type Lead, type TaskSearchResult } from '@vndesign/core';
import { BriefcaseBusiness, CheckSquare, CornerDownLeft, Loader2, Search, Square, User, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export type QuickPage = { href: string; label: string; icon: LucideIcon };

type Item = { key: string; group: 'Páginas' | 'Leads e projetos' | 'Tarefas'; label: string; hint?: string; href: string; icon: LucideIcon; done?: boolean };

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

export function QuickSearch({ open, onOpenChange, pages, tasks }: { open: boolean; onOpenChange: (open: boolean) => void; pages: QuickPage[]; tasks: boolean }) {
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
          <SearchBody pages={pages} tasks={tasks} onClose={() => onOpenChange(false)} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function SearchBody({ pages, tasks, onClose }: { pages: QuickPage[]; tasks: boolean; onClose: () => void }) {
  const router = useRouter();
  const listId = useId();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);

  // Espera um instante depois da última tecla antes de pesquisar.
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  const searching = term.length >= 2;
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

  const q = normalize(text.trim());
  const items: Item[] = [
    ...pages
      .filter((p) => !q || normalize(p.label).includes(q))
      .slice(0, q ? 4 : pages.length)
      .map((p) => ({ key: `p:${p.href}`, group: 'Páginas' as const, label: p.label, href: p.href, icon: p.icon })),
    ...(searching
      ? (leads.data ?? []).map((l) => ({
          key: `l:${l.id}`,
          group: 'Leads e projetos' as const,
          label: `#${l.number} ${l.company_name}${l.project_title ? ` · ${l.project_title}` : ''}`,
          hint: [LEAD_STATUS_META[l.status]?.label, l.city].filter(Boolean).join(' · '),
          href: l.status === 'cliente' ? leadPath(l, '#projeto') : leadPath(l),
          icon: l.status === 'cliente' ? BriefcaseBusiness : User,
        }))
      : []),
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
  ];
  const current = Math.min(active, Math.max(0, items.length - 1));
  const loading = searching && (leads.isFetching || (tasks && taskResults.isFetching));

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  let lastGroup = '';
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3">
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden /> : <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={items[current] ? `${listId}-${current}` : undefined}
          aria-label="Pesquisar leads, projetos, tarefas e páginas"
          placeholder="Pesquisar leads, projetos, tarefas…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((current + 1) % Math.max(1, items.length));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((current - 1 + items.length) % Math.max(1, items.length));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              go(items[current]);
            }
          }}
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[11px] text-muted sm:inline">Esc</kbd>
      </div>
      <ul id={listId} role="listbox" aria-label="Resultados" className="flex-1 overflow-y-auto p-2">
        {items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          const Icon = item.icon;
          return (
            <li key={item.key} role="presentation">
              {header ? <p className="px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase" role="presentation">{header}</p> : null}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => go(item)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm', i === current ? 'bg-accent-soft text-accent-text' : 'text-fg')}
              >
                <Icon className={cn('h-4 w-4 shrink-0', i === current ? 'text-accent-text' : 'text-muted')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate', item.done && 'line-through opacity-70')}>{item.label}</span>
                  {item.hint ? <span className="block truncate text-xs text-muted">{item.hint}</span> : null}
                </span>
                {i === current ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              </div>
            </li>
          );
        })}
        {searching && !loading && items.length === 0 ? <li className="px-2 py-6 text-center text-sm text-muted">Nada encontrado para “{term}”.</li> : null}
        {!searching && text.trim().length === 1 ? <li className="px-2 py-2 text-xs text-muted">Escreve mais uma letra para procurar leads e tarefas.</li> : null}
      </ul>
    </>
  );
}
