'use client';

/**
 * Definições → Formulário do site → "Analisar o meu site grátis": liga uma página pública
 * para pôr no teu site (plugin de WordPress/Bricks, link ou moldura). Quem a usa entra como lead quente, o site é
 * analisado e recebe o diagnóstico em PDF por email.
 */
import { DEFAULT_FREE_AUDIT_LAYOUT, freeAuditPageUrl, freeAuditSnippets, type FreeAuditLayout } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Copy, Download, ExternalLink, RefreshCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { useMailAccount, usePreference, useRole, useSetPreference, useSettings } from '@/lib/queries';

const LAYOUT_PREFERENCE = 'free_audit.layout';

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
  // Aspeto da página (com ou sem texto de persuasão, e de que lado): vale para o Abrir, o Copiar, o botão e a moldura.
  const { data: savedLayout } = usePreference<FreeAuditLayout>(LAYOUT_PREFERENCE);
  const saveLayout = useSetPreference<FreeAuditLayout>(LAYOUT_PREFERENCE);
  const layout: FreeAuditLayout = { ...DEFAULT_FREE_AUDIT_LAYOUT, ...(savedLayout ?? {}) };
  const setLayout = (next: Partial<FreeAuditLayout>) => saveLayout.mutate({ ...layout, ...next });
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
  const snippets = url ? freeAuditSnippets(url, layout) : null;
  const pageUrl = url ? freeAuditPageUrl(url, layout) : null;
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
                  {pageUrl}
                </code>
                <Button size="sm" variant="outline" onClick={() => void copy(pageUrl ?? url, 'Endereço')}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                </Button>
                <a href={pageUrl ?? url} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
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
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 font-medium">Aspeto da página (Abrir, botão e moldura)</legend>
              <label className="inline-flex w-fit items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={layout.promo} onChange={(e) => setLayout({ promo: e.target.checked })} />
                Texto de persuasão com imagem ao lado do formulário
              </label>
              {layout.promo ? (
                <div role="radiogroup" aria-label="Lado do texto de persuasão" className="inline-flex w-fit rounded-lg border border-border p-0.5">
                  {(
                    [
                      ['left', 'Texto à esquerda'],
                      ['right', 'Texto à direita'],
                    ] as const
                  ).map(([side, label]) => (
                    <button
                      key={side}
                      type="button"
                      role="radio"
                      aria-checked={layout.side === side}
                      onClick={() => setLayout({ side })}
                      className={layout.side === side ? 'rounded-md bg-surface-3 px-3 py-1 font-medium text-fg' : 'rounded-md px-3 py-1 text-muted hover:text-fg'}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted">No telemóvel o texto fica por cima do formulário. No plugin de WordPress estas escolhas fazem-se no próprio plugin.</p>
            </fieldset>
            <section className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label="Plugin para WordPress">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">Plugin para WordPress e Bricks (recomendado)</h3>
                <a href="/api/v1/free-audit/wordpress-plugin" download className={buttonClasses('primary', 'sm')}>
                  <Download className="h-3.5 w-3.5" aria-hidden /> Descarregar o plugin
                </a>
              </div>
              <p className="text-muted">O formulário fica no teu site, com o aspeto do teu site: textos, cores, letras e campos mudam-se no WordPress ou no próprio Bricks. Traz também um texto de persuasão com imagem ao lado do formulário (liga e desliga, à direita ou à esquerda). Já vem ligado a esta página.</p>
              <ol className="ml-4 list-decimal space-y-0.5 text-muted">
                <li>
                  No WordPress: <strong className="text-fg">Plugins → Adicionar novo → Carregar plugin</strong> → escolhe o ficheiro .zip → Instalar → Ativar.
                </li>
                <li>
                  Em <strong className="text-fg">Definições → Análise grátis</strong> confirma que diz “Ligado à plataforma” e muda os textos e as cores.
                </li>
                <li>
                  No Bricks, junta o elemento <strong className="text-fg">“Análise grátis do site”</strong> (categoria VNDesign). Noutros editores, um bloco Shortcode com <code className="rounded bg-surface-2 px-1">[vndesign_analise_gratis]</code>.
                </li>
              </ol>
              <p className="text-xs text-muted">Se criares outro endereço, descarrega o plugin outra vez ou cola o endereço novo nas definições do plugin.</p>
            </section>
            <details className="group">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /> Sem plugin: botão ou moldura
              </summary>
              <div className="mt-3 flex flex-col gap-4">
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
                  <h3 className="font-medium">Ou a página dentro do site (moldura que cresce sozinha)</h3>
                  <Button size="sm" variant="outline" onClick={() => void copy(snippets.iframe, 'HTML')}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar HTML
                  </Button>
                </div>
                <p className="text-muted">Mostra o formulário dentro de uma página tua (ex.: “Análise grátis”), com toda a largura da secção onde a pões. No Bricks: elemento “Código” com “Executar código” ligado.</p>
              </section>
              </div>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}
