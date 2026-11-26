'use client';

/**
 * Perguntar "tens a certeza?" numa janela da plataforma, em vez da caixa cinzenta
 * do browser (que no telemóvel parece um erro do sistema e não dá para traduzir).
 *
 * Uso: `if (!(await confirmar({ title: 'Apagar?', danger: true }))) return;`
 * A janela vive uma só vez na aplicação (<ConfirmHost /> em providers.tsx).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

export interface ConfirmOptions {
  /** A pergunta, curta (ex.: 'Apagar o caso de estudo?'). */
  title: string;
  /** O que acontece a seguir, se precisar de explicação. */
  description?: ReactNode;
  /** Texto do botão que confirma (por omissão "Continuar"). */
  confirm?: string;
  /** Texto do botão que desiste (por omissão "Cancelar"). */
  cancel?: string;
  /** Ação que apaga ou estraga alguma coisa: o botão fica vermelho. */
  danger?: boolean;
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((request: Request) => void) | null = null;

export function confirmar(options: ConfirmOptions): Promise<boolean> {
  // Sem a janela montada (fora da aplicação, ou antes de o browser arrancar): a caixa do browser.
  if (!show) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    const extra = typeof options.description === 'string' ? `\n\n${options.description}` : '';
    return Promise.resolve(window.confirm(`${options.title}${extra}`));
  }
  const open = show;
  // Um instante depois: muitas destas perguntas vêm de um menu que está a fechar-se
  // (e que devolve o foco ao botão). A janela abre depois, sem disputar o foco.
  return new Promise<boolean>((resolve) => window.setTimeout(() => open({ ...options, resolve }), 0));
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  useEffect(() => {
    show = setRequest;
    return () => {
      show = null;
    };
  }, []);
  const close = useCallback(
    (ok: boolean) => {
      setRequest((current) => {
        current?.resolve(ok);
        return null;
      });
    },
    [setRequest],
  );
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
      title={request?.title ?? ''}
      description={request?.description}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {request?.cancel ?? 'Cancelar'}
          </Button>
          <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {request?.confirm ?? 'Continuar'}
          </Button>
        </>
      }
    />
  );
}
