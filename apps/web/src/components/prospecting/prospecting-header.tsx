'use client';

/**
 * Topo da Prospeção: a ajuda "Como funciona" (aberta só na primeira visita).
 * (O objetivo do dia passou a metas do mês: components/dashboard/goals-card.tsx.)
 */
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, HoverHint } from '@/components/ui/button';

const HELP_SEEN = 'vnd.prospecao.help';

/** Ajuda recolhida: o botão "Como funciona" abre-a; na primeira visita aparece aberta. */
export function useProspectingHelp(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- só no browser (localStorage)
      setOpen(!window.localStorage.getItem(HELP_SEEN));
    } catch {
      setOpen(false);
    }
  }, []);
  function set(next: boolean) {
    setOpen(next);
    if (!next) {
      try {
        window.localStorage.setItem(HELP_SEEN, '1');
      } catch {
        // sem localStorage: volta a aparecer na próxima visita
      }
    }
  }
  return [open, set];
}

export function HelpButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    // Só o ícone; "Como funciona" aparece ao passar o rato.
    <Button size="icon" variant="ghost" onClick={onToggle} aria-expanded={open} aria-controls="prospecao-ajuda" className="group relative" aria-label="Como funciona">
      <HelpCircle className="h-4 w-4" aria-hidden />
      <HoverHint>Como funciona</HoverHint>
    </Button>
  );
}

export function HelpNote({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div id="prospecao-ajuda" role="note" className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
      <p className="flex-1 text-muted">
        {children}{' '}
        <Link href="/ajuda#prospecao" className="font-medium text-accent-text hover:underline">
          Ver o guia completo
        </Link>
      </p>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Percebi
      </Button>
    </div>
  );
}
