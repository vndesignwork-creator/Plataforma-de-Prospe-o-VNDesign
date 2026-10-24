'use client';

/**
 * Ordem dos cartões da coluna lateral da ficha (Tarefas, Notas, Reuniões…):
 * cada pessoa escolhe a sua e esconde os que não usa. Fica na conta
 * (preferência "lead.cards"), por isso vale no computador e no telemóvel.
 */
import {
  ALWAYS_SHOWN_CARDS,
  LEAD_CARDS_PREFERENCE,
  LEAD_CARD_LABELS,
  arrangeCards,
  type LeadCard,
  type LeadCardLayout,
} from '@vndesign/core';
import { ArrowDown, ArrowUp, LayoutList } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { usePreference, useSetPreference } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function useCardLayout() {
  const { data } = usePreference<LeadCardLayout>(LEAD_CARDS_PREFERENCE);
  return data && typeof data === 'object' ? data : null;
}

export function CardLayoutButton({ available }: { available: readonly LeadCard[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 self-center rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
      >
        <LayoutList className="h-3.5 w-3.5" aria-hidden /> Organizar cartões
      </button>
      {open ? <CardLayoutDialog available={available} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CardLayoutDialog({ available, onClose }: { available: readonly LeadCard[]; onClose: () => void }) {
  const layout = useCardLayout();
  const save = useSetPreference<LeadCardLayout>(LEAD_CARDS_PREFERENCE);
  // Só os cartões que existem nesta ficha (os outros mantêm o lugar).
  const [order, setOrder] = useState<LeadCard[]>(() => arrangeCards(layout).filter((k) => available.includes(k)));
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
    // Junta à ordem completa: os cartões que não aparecem nesta ficha ficam onde estavam.
    const full = arrangeCards(layout);
    const slots = full.map((k, i) => (order.includes(k) ? i : -1)).filter((i) => i >= 0);
    slots.forEach((slot, j) => (full[slot] = order[j]!));
    store({ order: full, hidden: [...hidden] }, 'Ficha organizada.');
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Organizar cartões"
      description="A ordem dos cartões ao lado da ficha (no telemóvel, por baixo) e os que queres ver. Vale para todos os leads."
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
      <ol className="flex flex-col gap-1" aria-label="Cartões da ficha">
        {order.map((k, i) => {
          const fixed = ALWAYS_SHOWN_CARDS.includes(k);
          const shown = fixed || !hidden.has(k);
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
                  aria-label={`Mostrar ${LEAD_CARD_LABELS[k]}`}
                />
                <span className="truncate">{LEAD_CARD_LABELS[k]}</span>
                {fixed ? <span className="text-xs text-muted">(sempre à vista)</span> : null}
              </label>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${LEAD_CARD_LABELS[k]}`}>
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${LEAD_CARD_LABELS[k]}`}>
                <ArrowDown className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}
