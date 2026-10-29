'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/** Valor com atraso (para pesquisa enquanto se escreve). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const noop = () => () => {};

/**
 * Falso no servidor e durante a hidratação; verdadeiro depois. Para partes que
 * dependem de dados em cache (TanStack Query) e que, hidratadas mais tarde
 * (dentro de <Suspense>), já teriam dados que o HTML do servidor não tinha.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
