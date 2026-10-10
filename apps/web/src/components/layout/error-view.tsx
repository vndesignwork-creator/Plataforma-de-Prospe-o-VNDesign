'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { checkServer, isUpdateError } from '@/lib/app-version';

const RELOAD_KEY = 'vnd-error-reload';

/**
 * Página de erro (em vez do "This page couldn't load" do Next). Se o erro vier de uma
 * publicação nova (ficheiros antigos que já não existem, servidor a reiniciar), espera
 * que o servidor responda e recarrega sozinha; senão, explica e dá botões.
 */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const updating = isUpdateError(error);
  // Já se tentou recarregar há pouco? Então não insistir (evita ciclos).
  const [autoReload] = useState(() => {
    if (!updating) return false;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      return Date.now() - last > 30_000;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!autoReload) return;
    let stopped = false;
    async function wait() {
      const state = await checkServer();
      if (stopped) return;
      if (state.status === 'ok') {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        } catch {
          // sem armazenamento: recarrega na mesma
        }
        window.location.reload();
      } else window.setTimeout(wait, 4000);
    }
    void wait();
    return () => {
      stopped = true;
    };
  }, [autoReload]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      {autoReload ? (
        <Loader2 className="h-8 w-8 animate-spin text-accent-text" aria-hidden />
      ) : (
        <AlertTriangle className="h-8 w-8 text-warning" aria-hidden />
      )}
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-display text-2xl font-bold">
          {updating ? 'A plataforma foi atualizada' : 'Não foi possível abrir esta página'}
        </h1>
        <p className="text-muted">
          {autoReload
            ? 'Estamos a carregar a versão nova — demora só uns segundos (se a publicação ainda estiver a decorrer, espera um pouco).'
            : updating
              ? 'Recarrega a página para usar a versão nova. Se a publicação ainda estiver a decorrer, espera um minuto e tenta outra vez.'
              : 'Ocorreu um erro inesperado. Tenta outra vez; se continuar, volta ao Dashboard.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
        {reset && !updating ? (
          <Button variant="outline" onClick={reset}>
            Tentar outra vez
          </Button>
        ) : null}
        {/* Navegação completa de propósito: depois de um erro, o estado da página pode estar estragado. */}
        {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
        <Button variant="ghost" onClick={() => window.location.assign('/dashboard')}>
          Ir para o Dashboard
        </Button>
      </div>
      {error.digest ? <p className="text-xs text-muted">Código do erro: {error.digest}</p> : null}
    </div>
  );
}
