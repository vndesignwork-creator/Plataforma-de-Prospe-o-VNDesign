'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ComponentProps } from 'react';

// Página anterior dentro da plataforma (o document.referrer não muda nas navegações internas).
let currentPath: string | null = null;
let previousPath: string | null = null;

/** Regista as mudanças de página (montado uma vez, no AppShell). */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== currentPath) {
      previousPath = currentPath;
      currentPath = pathname;
    }
  }, [pathname]);
  return null;
}

/**
 * Link para a página anterior no caminho. Se vieste mesmo dessa página (ex.: a lista
 * de leads com filtros), volta atrás no histórico — mantém os filtros e a posição.
 */
export function BackLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      {...props}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (previousPath === href && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    />
  );
}
