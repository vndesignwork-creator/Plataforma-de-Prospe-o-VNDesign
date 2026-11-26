'use client';

/**
 * Uma dica que se lê uma vez e se fecha ("Percebi"). A escolha fica guardada
 * neste browser, por isso a explicação não fica para sempre no meio do trabalho.
 * Sem localStorage (janela privada, bloqueado), aparece na mesma — só não se lembra.
 */

import { HelpCircle } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';

const PREFIX = 'vnd:dica:';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Já foi fechada? (no servidor e na primeira pintura conta como fechada, para não piscar) */
export function useDicaFechada(key: string): [boolean, () => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => '1',
  );
  const close = () => {
    try {
      localStorage.setItem(PREFIX + key, '1');
    } catch {
      // Sem localStorage: fecha só desta vez.
    }
    listeners.forEach((l) => l());
  };
  return [stored === '1', close];
}

export function Dica({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const [fechada, fechar] = useDicaFechada(id);
  if (fechada) return null;
  return (
    <div role="note" className={cn('flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm', className)}>
      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
      <p className="flex-1 text-muted">{children}</p>
      <Button size="sm" variant="ghost" onClick={fechar}>
        Percebi
      </Button>
    </div>
  );
}
