'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'vnd-theme';

/** Script inline (no <head>) que aplica o tema antes de pintar, sem "flash". */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark';}catch(e){}})();`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const readTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Tema atual (escuro por omissão) — fonte de verdade: atributo data-theme do <html>. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'dark' as Theme);
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // armazenamento indisponível (modo privado): o tema vale só nesta sessão
    }
  }, []);
  return { theme, setTheme };
}
