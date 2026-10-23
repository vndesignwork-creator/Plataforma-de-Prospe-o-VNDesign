'use client';

/**
 * Definições → Formulário do site: liga um endereço público que transforma os
 * pedidos de contacto do site em leads (com tarefa para responder hoje e aviso
 * no telemóvel). Mostra o HTML pronto a colar e como ligar o formulário do Bricks.
 */
import { siteFormSnippet } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Inbox, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { useRole, useSettings } from '@/lib/queries';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

export function SiteFormSettings() {
  const { data: settings, isLoading } = useSettings();
  const role = useRole();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const canEdit = role === 'owner' || role === 'admin';
  const token = settings?.site_form.token ?? null;
  const endpoint = token ? `${typeof window === 'undefined' ? '' : window.location.origin}/api/v1/public/forms/${token}` : null;

  async function toggle(enabled: boolean, rotate = false) {
    setBusy(true);
    try {
      await api('/site-form', { method: 'POST', body: { enabled, rotate } });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      setConfirmRotate(false);
      toast.success(!enabled ? 'Formulário do site desligado.' : rotate ? 'Endereço novo criado: atualiza-o no site.' : 'Formulário do site ligado.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !settings) return <Skeleton className="h-40" />;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Formulário do site"
          description="Quem preenche o contacto no teu site entra logo como lead (canal “Formulário do site”), com a mensagem na linha do tempo, a tarefa “Responder ao pedido do site” para hoje e um aviso no telemóvel."
          actions={
            canEdit ? (
              token ? (
                <Button size="sm" variant="outline" onClick={() => void toggle(false)} loading={busy}>
                  Desligar
                </Button>
              ) : (
                <Button size="sm" onClick={() => void toggle(true)} loading={busy}>
                  <Inbox className="h-3.5 w-3.5" aria-hidden /> Ligar
                </Button>
              )
            ) : null
          }
        />
        <div className="flex flex-col gap-4 p-4 text-sm">
          {!endpoint ? (
            <p className="text-muted">Desligado. Ao ligar, crias um endereço secreto para onde o formulário do site envia os pedidos.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="font-medium">Endereço do formulário</span>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-xs break-all" aria-label="Endereço do formulário">
                    {endpoint}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => void copy(endpoint, 'Endereço')}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                  </Button>
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

              <section className="flex flex-col gap-1.5" aria-label="Formulário do Bricks">
                <h3 className="font-medium">Com o formulário do Bricks (versões com a ação Webhook)</h3>
                <ol className="list-decimal space-y-1 pl-5 text-muted">
                  <li>No Bricks, seleciona o elemento <strong className="text-fg">Formulário</strong> → <strong className="text-fg">Ações após o envio</strong> → junta <strong className="text-fg">Webhook</strong>.</li>
                  <li>Em <strong className="text-fg">URL</strong>, cola o endereço acima (método POST, formato JSON).</li>
                  <li>Dá aos campos nomes simples, se puderes: nome, email, telefone, empresa, mensagem. Se não, a plataforma reconhece-os pelo conteúdo.</li>
                  <li>Mantém também a ação “Email”, se quiseres receber o pedido no email como até agora.</li>
                </ol>
              </section>

              <section className="flex flex-col gap-1.5" aria-label="HTML pronto a colar">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Ou HTML pronto a colar (elemento “Código”)</h3>
                  <Button size="sm" variant="outline" onClick={() => void copy(siteFormSnippet(endpoint), 'HTML')}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar HTML
                  </Button>
                </div>
                <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 text-xs break-words whitespace-pre-wrap">{siteFormSnippet(endpoint)}</pre>
              </section>
              <p className="text-xs text-muted">
                Proteções: campo escondido contra robôs, no máximo 5 pedidos por 10 minutos por pessoa e é preciso email ou telefone. Se a pessoa já for lead (mesmo
                email ou nome), o pedido junta-se a esse lead.
              </p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
