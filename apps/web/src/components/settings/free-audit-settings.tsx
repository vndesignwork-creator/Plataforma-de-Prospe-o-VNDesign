'use client';

/**
 * Definições → Formulário do site → "Analisar o meu site grátis": liga uma página pública
 * para pôr no teu site (link ou moldura). Quem a usa entra como lead quente, o site é
 * analisado e recebe o diagnóstico em PDF por email.
 */
import { freeAuditSnippets } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, RefreshCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { useMailAccount, useRole, useSettings } from '@/lib/queries';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

export function FreeAuditSettings() {
  const { data: settings, isLoading } = useSettings();
  const { data: account } = useMailAccount();
  const role = useRole();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const canEdit = role === 'owner' || role === 'admin';
  const token = settings?.free_audit?.token ?? null;
  const url = token ? `${typeof window === 'undefined' ? '' : window.location.origin}/analise/${token}` : null;

  async function toggle(enabled: boolean, rotate = false) {
    setBusy(true);
    try {
      await api('/free-audit', { method: 'POST', body: { enabled, rotate } });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      setConfirmRotate(false);
      toast.success(!enabled ? 'Análise grátis desligada.' : rotate ? 'Endereço novo criado: atualiza-o no site.' : 'Análise grátis ligada.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !settings) return <Skeleton className="h-40" />;
  const snippets = url ? freeAuditSnippets(url) : null;
  return (
    <Card className="mt-5">
      <CardHeader
        title="Analisar o meu site grátis"
        description="Uma página para pôr no teu site: o visitante escreve o site e o email, entra como lead quente (com “Ligar” para hoje), o site é analisado e recebe o diagnóstico em PDF por email."
        actions={
          canEdit ? (
            token ? (
              <Button size="sm" variant="outline" onClick={() => void toggle(false)} loading={busy}>
                Desligar
              </Button>
            ) : (
              <Button size="sm" onClick={() => void toggle(true)} loading={busy}>
                <Search className="h-3.5 w-3.5" aria-hidden /> Ligar
              </Button>
            )
          ) : null
        }
      />
      <div className="flex flex-col gap-4 p-4 text-sm">
        {!account ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-warning">
            Para o PDF seguir sozinho por email, liga o{' '}
            <Link href="/definicoes/email" className="underline underline-offset-2">
              email de envio
            </Link>
            . Sem ele, recebes um aviso para o enviares tu.
          </p>
        ) : null}
        {!url || !snippets ? (
          <p className="text-muted">Desligada. Ao ligar, crias um endereço público (com um código) para pores no teu site.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="font-medium">Endereço da página</span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-xs break-all" aria-label="Endereço da página">
                  {url}
                </code>
                <Button size="sm" variant="outline" onClick={() => void copy(url, 'Endereço')}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                </Button>
                <a href={url} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir
                </a>
              </div>
              {canEdit ? (
                confirmRotate ? (
                  <span className="inline-flex flex-wrap items-center gap-2 text-xs">
                    O endereço atual deixa de funcionar. Continuar?
                    <Button size="sm" variant="danger" onClick={() => void toggle(true, true)} loading={busy}>
                      Sim, criar outro
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(false)}>
                      Não
                    </Button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmRotate(true)} className="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-fg">
                    <RefreshCcw className="h-3 w-3" aria-hidden /> Criar outro endereço (se receberes spam)
                  </button>
                )
              ) : null}
            </div>
            <section className="flex flex-col gap-1.5" aria-label="Botão para o site">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">Botão para o site (abre a página)</h3>
                <Button size="sm" variant="outline" onClick={() => void copy(snippets.button, 'HTML')}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar HTML
                </Button>
              </div>
              <p className="text-muted">No Bricks: elemento “Código” (ou um botão com este link). Fica bem no topo da página inicial ou no fim de cada página.</p>
            </section>
            <section className="flex flex-col gap-1.5" aria-label="Página dentro do site">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">Ou a página dentro do site (moldura)</h3>
                <Button size="sm" variant="outline" onClick={() => void copy(snippets.iframe, 'HTML')}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar HTML
                </Button>
              </div>
              <p className="text-muted">Mostra o formulário dentro de uma página tua (ex.: “Análise grátis”).</p>
            </section>
          </>
        )}
      </div>
    </Card>
  );
}
