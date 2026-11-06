'use client';

/**
 * Botão "Objeção" (Prospeção e ficha): escolhe o que o lead disse ("É caro", "Já tenho
 * site"…) e aparece a resposta pronta para este lead e canal (ao telefone, WhatsApp ou
 * email). Com IA é escrita para o lead; sem IA, a resposta-base. Dá para copiar, abrir no
 * WhatsApp ou pedir outra versão.
 */
import {
  OBJECTIONS,
  OBJECTION_CHANNELS,
  OBJECTION_CHANNEL_LABELS,
  OBJECTION_LABELS,
  type Lead,
  type Objection,
  type ObjectionChannel,
  type ObjectionReply,
} from '@vndesign/core';
import { ChevronDown, Copy, Lightbulb, MessageCircle, MessageSquareWarning, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Input, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { cn, whatsappUrl } from '@/lib/utils';

function ObjectionDialog({ lead, objection, initialChannel, onClose }: { lead: Lead; objection: Objection; initialChannel: ObjectionChannel; onClose: () => void }) {
  const [channel, setChannel] = useState<ObjectionChannel>(initialChannel);
  const [detail, setDetail] = useState('');
  const [result, setResult] = useState<ObjectionReply | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  async function load(nextChannel = channel) {
    const id = ++seq.current;
    setBusy(true);
    try {
      const { data } = await api<{ data: ObjectionReply }>(`/leads/${lead.id}/objection`, {
        method: 'POST',
        body: { objection, channel: nextChannel, ...(detail.trim() ? { detail: detail.trim() } : {}) },
      });
      if (id !== seq.current) return;
      setResult(data);
      setText(data.reply);
    } catch (error) {
      if (id === seq.current) toast.error(errorMessage(error));
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }

  // Só ao abrir (o canal e "Outra versão" pedem de novo).
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- pede a resposta ao abrir a janela */
    void load(initialChannel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  const wa = channel === 'whatsapp' ? whatsappUrl(lead.phone, text) : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={OBJECTION_LABELS[objection]}
      description={`Resposta para ${lead.company_name}. Podes mudar o texto antes de usar.`}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('outline')}>
              <MessageCircle className="h-4 w-4" aria-hidden /> Abrir no WhatsApp
            </a>
          ) : null}
          <Button onClick={() => void copy()} disabled={!text.trim()}>
            <Copy className="h-4 w-4" aria-hidden /> Copiar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Canal" className="inline-flex w-fit rounded-lg border border-border p-0.5 text-sm">
          {OBJECTION_CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={channel === c}
              onClick={() => {
                if (c === channel) return;
                setChannel(c);
                void load(c);
              }}
              className={cn('rounded-md px-3 py-1', channel === c ? 'bg-surface-3 font-medium text-fg' : 'text-muted hover:text-fg')}
            >
              {OBJECTION_CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            O que disse, por palavras dele <span className="font-normal text-muted">(opcional)</span>
          </span>
          <span className="flex gap-2">
            <Input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="ex.: Já pagámos a um rapaz há 2 anos e ficou mal" maxLength={500} className="min-w-0 flex-1" />
            <Button variant="outline" onClick={() => void load()} loading={busy} aria-label="Outra versão">
              <RefreshCw className="h-4 w-4" aria-hidden /> <span className="max-sm:hidden">Outra versão</span>
            </Button>
          </span>
        </label>
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={channel === 'email' ? 9 : 6}
            aria-label="Resposta"
            className={cn('leading-relaxed', busy && 'opacity-50')}
            placeholder={busy ? 'A escrever…' : ''}
          />
        </div>
        {result ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {result.source === 'ai' ? (
              <span className="inline-flex items-center gap-1 text-accent-text">
                <Sparkles className="h-3 w-3" aria-hidden /> Escrita pela IA para este lead
              </span>
            ) : (
              <span>Resposta-base (liga a IA em Definições → Inteligência artificial para ser escrita para cada lead)</span>
            )}
          </p>
        ) : null}
        {result?.tip ? (
          <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden /> {result.tip}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export function ObjectionButton({ lead, channel = 'phone', className, label = 'Objeção' }: { lead: Lead; channel?: ObjectionChannel; className?: string; label?: string }) {
  const [open, setOpen] = useState<Objection | null>(null);
  return (
    <>
      <DropdownRoot>
        <DropdownTrigger className={className ?? buttonClasses('ghost', 'sm')} aria-label={`Responder a uma objeção de ${lead.company_name}`}>
          <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden /> {label}
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        </DropdownTrigger>
        <DropdownContent align="start" className="max-w-80">
          <DropdownLabel>O que disse o lead?</DropdownLabel>
          {OBJECTIONS.map((o) => (
            <DropdownItem key={o} onSelect={() => setOpen(o)}>
              {OBJECTION_LABELS[o]}
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownRoot>
      {open ? <ObjectionDialog lead={lead} objection={open} initialChannel={channel} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
