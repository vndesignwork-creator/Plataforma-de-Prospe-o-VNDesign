'use client';

/** O atalho da pesquisa rápida fica à parte: a janela só se descarrega quando se abre. */
import { useEffect } from 'react';

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
    // Um Ctrl+K carregado antes de a app arrancar (guardado no layout) abre já a pesquisa.
    const w = window as Window & { __vndQuickSearchReady?: boolean; __vndQuickSearchPending?: boolean };
    w.__vndQuickSearchReady = true;
    if (w.__vndQuickSearchPending) {
      w.__vndQuickSearchPending = false;
      onOpen();
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      w.__vndQuickSearchReady = false;
    };
  }, [onOpen]);
}

/** Texto do atalho para mostrar no botão ("Ctrl K" ou "⌘K"). */
export function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
}
