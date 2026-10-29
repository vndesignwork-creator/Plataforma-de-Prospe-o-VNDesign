'use client';

import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LEAVE_MESSAGE = 'Tens alterações por guardar. Sair sem guardar?';

/** Com alterações por guardar: pergunta antes de fechar o separador ou de seguir um link da plataforma. */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // Fase de captura no document: corre antes do clique do <Link> do Next (que está na raiz da app).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}

/**
 * Rodapé de um formulário de definições: fica colado ao fundo do ecrã enquanto
 * se edita, diz quando há alterações por guardar e deixa descartá-las.
 */
export function FormSaveBar({
  dirty,
  saving,
  onDiscard,
  disableWhenClean = false,
  children,
  className,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard?: () => void;
  /** Sem alterações, o botão de guardar fica desligado. */
  disableWhenClean?: boolean;
  /** Texto do botão de guardar. */
  children: ReactNode;
  className?: string;
}) {
  useLeaveGuard(dirty);
  return (
    <div
      className={cn(
        '-mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t px-4 py-3 md:col-span-2',
        // Só fica colado ao fundo do ecrã com alterações (sem elas não tapa os campos no telemóvel).
        dirty ? 'sticky bottom-0 z-10 border-border bg-surface/95 backdrop-blur' : 'border-transparent',
        className,
      )}
    >
      {dirty ? (
        <p role="status" className="mr-auto flex items-center gap-2 text-sm font-medium text-warning">
          <span className="h-2 w-2 rounded-full bg-warning" aria-hidden /> Alterações por guardar
        </p>
      ) : null}
      {dirty && onDiscard ? (
        <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving}>
          Descartar
        </Button>
      ) : null}
      <Button type="submit" loading={saving} disabled={disableWhenClean && !dirty}>
        {children}
      </Button>
    </div>
  );
}
