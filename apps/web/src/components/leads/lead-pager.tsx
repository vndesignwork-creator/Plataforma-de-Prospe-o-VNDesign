'use client';

/**
 * Seguinte / Anterior na ficha: a lista de leads guarda (nesta janela) os
 * leads que está a mostrar, com os filtros; a ficha mostra ← → para passar ao
 * lead seguinte dessa lista sem voltar atrás (também J e K no teclado). No fim
 * de uma página vai buscar a seguinte.
 */
import { leadPath, type Lead } from '@vndesign/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { usePrefetchLead } from '@/lib/queries';
import { isTypingTarget } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

const KEY = 'vnd.lead-list';
type Item = { id: string; number: number; company_name: string };
type Stored = { query: Record<string, unknown>; page: number; limit: number; total: number; items: Item[]; back: string };

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function write(value: Stored) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Sem sessionStorage: a ficha só não mostra as setas.
  }
}

/** A lista de leads chama isto sempre que mostra uma página (com os filtros atuais). */
export function rememberLeadList(query: Record<string, unknown>, total: number, rows: readonly Item[]) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? rows.length);
  write({ query, page, limit, total, items: rows.map((r) => ({ id: r.id, number: r.number, company_name: r.company_name })), back: `${location.pathname}${location.search}` });
}

async function fetchPage(list: Stored, page: number): Promise<Stored | null> {
  const res = await api<{ data: Item[]; meta: { total: number } }>('/leads', { query: { ...list.query, page } as never });
  if (!res.data.length) return null;
  const next = { ...list, page, total: res.meta.total, items: res.data.map((r) => ({ id: r.id, number: r.number, company_name: r.company_name })) };
  write(next);
  return next;
}

export function LeadPager({ lead, className }: { lead: Lead; className?: string }) {
  const router = useRouter();
  const [list, setList] = useState<Stored | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage só existe no browser */
    setList(read());
  }, [lead.id]);
  const index = list ? list.items.findIndex((i) => i.id === lead.id) : -1;
  const position = list && index >= 0 ? (list.page - 1) * list.limit + index + 1 : 0;
  const hasPrev = position > 1;
  const hasNext = !!list && index >= 0 && position < list.total;
  const prefetchLead = usePrefetchLead();
  const nextItem = list && index >= 0 ? list.items[index + 1] : undefined;

  // Com a ficha já aberta, prepara a seguinte (página e dados): "Lead seguinte" / J abre logo.
  useEffect(() => {
    if (!nextItem) return;
    const timer = window.setTimeout(() => {
      router.prefetch(leadPath(nextItem));
      prefetchLead(nextItem.id);
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando muda o lead seguinte
  }, [nextItem?.id]);

  async function go(step: 1 | -1) {
    if (!list || busy || (step === 1 ? !hasNext : !hasPrev)) return;
    let target: Item | undefined = list.items[index + step];
    if (!target) {
      // Passa para a página seguinte (ou anterior) da lista.
      setBusy(true);
      try {
        const other = await fetchPage(list, list.page + step);
        target = other ? (step === 1 ? other.items[0] : other.items[other.items.length - 1]) : undefined;
      } finally {
        setBusy(false);
      }
    }
    if (target) router.push(leadPath(target));
  }

  // J = seguinte, K = anterior (como no Gmail), fora das caixas de texto e janelas.
  useEffect(() => {
    if (index < 0) return;
    let afterG = 0;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || document.querySelector('[role="dialog"], [role="menu"]')) return;
      // "G + K" é o atalho do Kanban: não conta como "anterior".
      if (e.key === 'g') {
        afterG = Date.now();
        return;
      }
      if ((e.key === 'j' || e.key === 'k') && Date.now() - afterG > 1500) {
        e.preventDefault();
        void go(e.key === 'j' ? 1 : -1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!list || index < 0) return null;
  const button = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40';
  return (
    <nav aria-label="Leads da lista" className={cn('inline-flex items-center gap-1 text-xs text-muted', className)}>
      <button type="button" className={button} onClick={() => void go(-1)} disabled={!hasPrev || busy} aria-label="Lead anterior" title="Lead anterior (K)">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <a href={list.back} className="tabular hover:text-fg hover:underline" title="Voltar à lista">
        {position} de {list.total}
      </a>
      <button type="button" className={button} onClick={() => void go(1)} disabled={!hasNext || busy} aria-label="Lead seguinte" title="Lead seguinte (J)">
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}
