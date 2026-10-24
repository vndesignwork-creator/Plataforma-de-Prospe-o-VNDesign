'use client';

/**
 * Atalhos de teclado no computador (N, /, ?, G + tecla) e a janela "?" com a
 * lista. Só para as páginas a que a pessoa tem acesso (as do menu).
 */
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { isTypingTarget, resolveShortcut, shortcutList } from '@/lib/shortcuts';

export function useKeyboardShortcuts({ allowed, onSearch, onHelp }: { allowed: (href: string) => boolean; onSearch: () => void; onHelp: () => void }) {
  const router = useRouter();
  const ref = useRef({ allowed, onSearch, onHelp, router });
  useEffect(() => {
    ref.current = { allowed, onSearch, onHelp, router };
  });
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]')) return;
      const afterG = Date.now() - gAt < 1500;
      const hit = resolveShortcut(e.key, afterG);
      gAt = 0;
      if (!hit) return;
      if (hit === 'g') {
        gAt = Date.now();
        return;
      }
      const { allowed: can, onSearch: search, onHelp: help, router: r } = ref.current;
      if (hit.href && !can(hit.href)) return;
      e.preventDefault();
      if (hit.action === 'search') search();
      else if (hit.action === 'help') help();
      else if (hit.href) r.push(hit.href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function ShortcutsDialog({ open, onOpenChange, allowed }: { open: boolean; onOpenChange: (open: boolean) => void; allowed: (href: string) => boolean }) {
  const list = shortcutList(allowed);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Atalhos de teclado" description="Em qualquer página, fora dos campos de texto. G + tecla: carrega no G e logo a seguir na outra." className="max-w-md">
      <ul className="divide-y divide-border text-sm" aria-label="Atalhos">
        {list.map((s) => (
          <li key={s.keys.join('+')} className="flex items-center justify-between gap-3 py-2">
            <span>{s.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {s.keys.map((k, i) => (
                <kbd key={i} className="min-w-6 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-center text-xs font-medium">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
