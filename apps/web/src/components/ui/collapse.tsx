'use client';

/**
 * Cartões que se podem recolher (ex.: Diagnóstico do site, Kit GEO): a escolha
 * fica lembrada neste browser, para todos os leads. Sem localStorage (janela
 * privada, bloqueado), funciona na mesma — só não fica lembrada.
 */
import { ChevronDown } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

const PREFIX = 'vnd:collapsed:';
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

/** [recolhido, mudar]: sem escolha guardada, usa `defaultCollapsed`. */
export function useCollapsed(key: string, defaultCollapsed = false): [boolean, (collapsed: boolean) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const collapsed = stored === null ? defaultCollapsed : stored === '1';
  const set = (value: boolean) => {
    try {
      localStorage.setItem(PREFIX + key, value ? '1' : '0');
    } catch {
      // Sem localStorage: a escolha não fica guardada.
    }
    listeners.forEach((l) => l());
  };
  return [collapsed, set];
}

/** Botão ⌄ no cabeçalho do cartão (recolher / expandir). */
export function CollapseButton({ collapsed, onToggle, label, className }: { collapsed: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Expandir: ${label}` : `Recolher: ${label}`}
      title={collapsed ? 'Expandir' : 'Recolher'}
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg pointer-coarse:h-10 pointer-coarse:w-10', className)}
    >
      <ChevronDown className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} aria-hidden />
    </button>
  );
}
