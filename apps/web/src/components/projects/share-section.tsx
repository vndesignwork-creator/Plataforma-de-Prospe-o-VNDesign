'use client';

/**
 * Página de acompanhamento para o cliente: um link só de leitura com a fase,
 * as tarefas, a próxima entrega e reunião e o que falta pagar. Liga-se,
 * renova-se (o antigo deixa de funcionar) ou desliga-se.
 */
import type { Lead } from '@vndesign/core';
import { Copy, ExternalLink, Link2, Link2Off, MessageCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useProjectInfo, useProjectShare } from '@/lib/queries';
import { whatsappUrl } from '@/lib/utils';
import { SectionHeader } from './section-header';

export function shareUrl(token: string): string {
  return `${typeof window === 'undefined' ? '' : window.location.origin}/p/${token}`;
}

export function ShareSection({ lead }: { lead: Lead }) {
  const { data: info } = useProjectInfo(lead.id);
  const share = useProjectShare(lead.id);
  const [confirm, setConfirm] = useState<'off' | 'renew' | null>(null);
  const token = info?.share_token ?? null;
  const url = token ? shareUrl(token) : null;
  const wa = url ? whatsappUrl(lead.phone, `Olá${lead.contact_name ? ` ${lead.contact_name}` : ''}! Pode acompanhar o andamento do projeto aqui: ${url}`) : null;

  async function set(enabled: boolean, regenerate = false) {
    try {
      await share.mutateAsync({ enabled, regenerate });
      setConfirm(null);
      toast.success(!enabled ? 'Link desligado: a página deixou de abrir.' : regenerate ? 'Link novo criado (o antigo deixou de funcionar).' : 'Link criado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Seleciona o link e copia manualmente.');
    }
  }

  return (
    <section aria-labelledby={`share-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`share-${lead.id}`}
        icon={Link2}
        title="Página para o cliente"
        summary={url ? 'Ligada' : null}
        action={
          url ? null : (
            <Button size="sm" variant="outline" onClick={() => void set(true)} loading={share.isPending}>
              <Link2 className="h-3.5 w-3.5" aria-hidden /> Criar link
            </Button>
          )
        }
      />
      {url ? (
        <div className="mt-2 flex flex-col gap-2">
          <Input readOnly value={url} aria-label="Link da página do cliente" onFocus={(e) => e.target.select()} className="text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
            </Button>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'sm')}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Enviar por WhatsApp
              </a>
            ) : null}
            <a href={url} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ver como o cliente
            </a>
            <Button size="sm" variant="ghost" onClick={() => setConfirm('renew')}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Novo link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm('off')}>
              <Link2Off className="h-3.5 w-3.5" aria-hidden /> Desligar
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Um link só de leitura (sem login) com o progresso, a próxima entrega e reunião e o que falta pagar. Não mostra notas nem valores
          internos.
        </p>
      )}
      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => (!o ? setConfirm(null) : undefined)}
        title={confirm === 'off' ? 'Desligar o link?' : 'Criar um link novo?'}
        description={confirm === 'off' ? 'O cliente deixa de conseguir abrir a página.' : 'O link atual deixa de funcionar; envia o novo ao cliente.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button variant={confirm === 'off' ? 'danger' : 'primary'} onClick={() => void set(confirm !== 'off', confirm === 'renew')} loading={share.isPending}>
              {confirm === 'off' ? 'Desligar' : 'Criar link novo'}
            </Button>
          </>
        }
      />
    </section>
  );
}
