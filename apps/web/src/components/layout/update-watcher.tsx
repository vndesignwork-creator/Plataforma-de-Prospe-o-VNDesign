'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CLIENT_BUILD, checkServer } from '@/lib/app-version';

type Notice = 'none' | 'updating' | 'new-version';

const EVERY_MS = 5 * 60_000;
const WHILE_UPDATING_MS = 10_000;

/**
 * Faixa no topo do ecrã (as notificações aparecem em baixo):
 *  - "A plataforma está a ser atualizada" enquanto o servidor não responde (publicação na Hostinger);
 *  - "Há uma versão nova" quando a versão publicada já não é a deste separador (botão Atualizar).
 * Verifica de 5 em 5 minutos, ao voltar ao separador e quando um pedido à API falha.
 */
export function UpdateWatcher() {
  const [notice, setNotice] = useState<Notice>('none');
  const failures = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!CLIENT_BUILD) return;
    let stopped = false;

    async function check() {
      window.clearTimeout(timer.current);
      const state = await checkServer();
      if (stopped) return;
      let next: Notice = 'none';
      if (state.status === 'down') {
        // Uma falha isolada não chega: só à segunda seguida se mostra o aviso.
        failures.current += 1;
        next = failures.current >= 2 ? 'updating' : 'none';
      } else {
        failures.current = 0;
        next = state.status === 'ok' && state.build && state.build !== CLIENT_BUILD ? 'new-version' : 'none';
      }
      setNotice((prev) => (prev === 'new-version' && next === 'none' ? prev : next));
      const delay = state.status === 'down' ? (failures.current >= 2 ? WHILE_UPDATING_MS : 3000) : EVERY_MS;
      timer.current = window.setTimeout(check, delay);
    }

    const onVisible = () => document.visibilityState === 'visible' && void check();
    // Um pedido falhou (ver lib/api-client): talvez seja uma publicação em curso.
    const onApiFailure = () => void check();
    timer.current = window.setTimeout(check, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('vnd:api-failure', onApiFailure);
    return () => {
      stopped = true;
      window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('vnd:api-failure', onApiFailure);
    };
  }, []);

  if (notice === 'none') return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-sm shadow-card"
    >
      {notice === 'updating' ? (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-text" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">A plataforma está a ser atualizada.</span>{' '}
            <span className="text-muted">Espera uns segundos antes de gravar alterações — este aviso desaparece quando terminar.</span>
          </p>
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">Há uma versão nova da plataforma.</span>{' '}
            <span className="text-muted">Atualiza para a usar (grava primeiro o que estiveres a escrever).</span>
          </p>
          <Button size="sm" onClick={() => window.location.reload()}>
            Atualizar
          </Button>
        </>
      )}
    </div>
  );
}
