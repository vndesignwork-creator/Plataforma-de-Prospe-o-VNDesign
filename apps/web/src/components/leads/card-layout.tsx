'use client';

/**
 * "Organizar cartões": cada pessoa escolhe a ordem dos cartões e esconde os que
 * não usa. Serve a coluna lateral da ficha (preferência "lead.cards") e o
 * Dashboard ("dashboard.cards"). Fica na conta: vale no computador e no telemóvel.
 */
import {
  ALWAYS_SHOWN_CARDS,
  DASHBOARD_ALWAYS_SHOWN,
  DASHBOARD_CARDS,
  DASHBOARD_CARDS_PREFERENCE,
  DASHBOARD_CARD_LABELS,
  LEAD_CARDS,
  LEAD_CARDS_PREFERENCE,
  LEAD_CARD_LABELS,
  arrangeKeys,
  type LeadCardLayout,
} from '@vndesign/core';
import { ArrowDown, ArrowUp, LayoutList } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { usePreference, useSetPreference } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** O que muda entre a ficha e o Dashboard. */
interface Board<K extends string> {
  preference: string;
  defaults: readonly K[];
  labels: Record<K, string>;
  alwaysShown: readonly K[];
  description: string;
}

export const LEAD_BOARD: Board<(typeof LEAD_CARDS)[number]> = {
  preference: LEAD_CARDS_PREFERENCE,
  defaults: LEAD_CARDS,
  labels: LEAD_CARD_LABELS,
  alwaysShown: ALWAYS_SHOWN_CARDS,
  description: 'A ordem dos cartões ao lado da ficha (no telemóvel, por baixo) e os que queres ver. Vale para todos os leads.',
};

export const DASHBOARD_BOARD: Board<(typeof DASHBOARD_CARDS)[number]> = {
  preference: DASHBOARD_CARDS_PREFERENCE,
  defaults: DASHBOARD_CARDS,
  labels: DASHBOARD_CARD_LABELS,
  alwaysShown: DASHBOARD_ALWAYS_SHOWN,
  description: 'A ordem dos cartões do Dashboard e os que queres ver.',
};

export function useCardLayout(preference: string = LEAD_CARDS_PREFERENCE) {
  const { data } = usePreference<LeadCardLayout>(preference);
  return data && typeof data === 'object' ? data : null;
}

/** Os cartões a mostrar, pela ordem escolhida (só os que existem e não estão escondidos). */
export function visibleCards<K extends string>(board: Board<K>, layout: LeadCardLayout | null, exists: (key: K) => boolean): K[] {
  return arrangeKeys(board.defaults, layout).filter((k) => exists(k) && (board.alwaysShown.includes(k) || !(layout?.hidden ?? []).includes(k)));
}

export function CardLayoutButton<K extends string>({ board, available, className }: { board: Board<K>; available: readonly K[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-1.5 self-center rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg', className)}
      >
        <LayoutList className="h-3.5 w-3.5" aria-hidden /> Organizar cartões
      </button>
      {open ? <CardLayoutDialog board={board} available={available} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CardLayoutDialog<K extends string>({ board, available, onClose }: { board: Board<K>; available: readonly K[]; onClose: () => void }) {
  const layout = useCardLayout(board.preference);
  const save = useSetPreference<LeadCardLayout>(board.preference);
  // Só os cartões que existem aqui (os outros mantêm o lugar).
  const [order, setOrder] = useState<K[]>(() => arrangeKeys(board.defaults, layout).filter((k) => available.includes(k)));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(layout?.hidden ?? []));

  function move(i: number, by: -1 | 1) {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setOrder(next);
  }

  function store(value: LeadCardLayout, message: string) {
    // mutateAsync: o aviso aparece mesmo com a janela já fechada.
    save.mutateAsync(value).then(
      () => toast.success(message),
      () => toast.error('Não foi possível guardar.'),
    );
    onClose();
  }

  function submit() {
    // Junta à ordem completa: os cartões que não aparecem aqui ficam onde estavam.
    const full = arrangeKeys(board.defaults, layout);
    const slots = full.map((k, i) => (order.includes(k) ? i : -1)).filter((i) => i >= 0);
    slots.forEach((slot, j) => (full[slot] = order[j]!));
    store({ order: full, hidden: [...hidden] }, 'Cartões organizados.');
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Organizar cartões"
      description={board.description}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => store({ order: [], hidden: [] }, 'Ordem original reposta.')}>
            Repor original
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-1" aria-label="Cartões">
        {order.map((k, i) => {
          const fixed = board.alwaysShown.includes(k);
          const shown = fixed || !hidden.has(k);
          const label = board.labels[k];
          return (
            <li key={k} className={cn('flex items-center gap-2 rounded-lg border border-border px-2 py-1.5', !shown && 'opacity-60')}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={fixed}
                  onChange={(e) => {
                    const next = new Set(hidden);
                    if (e.target.checked) next.delete(k);
                    else next.add(k);
                    setHidden(next);
                  }}
                  className="h-4 w-4"
                  aria-label={`Mostrar ${label}`}
                />
                <span className="truncate">{label}</span>
                {fixed ? <span className="text-xs text-muted">(sempre à vista)</span> : null}
              </label>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${label}`}>
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${label}`}>
                <ArrowDown className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}
