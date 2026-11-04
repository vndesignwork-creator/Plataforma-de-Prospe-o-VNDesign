'use client';

/**
 * "Enviar" um email a um lead pela conta do utilizador (Definições → Email de envio).
 * Mostra o email pronto a rever (Para, Assunto, Mensagem) antes de sair. A janela
 * (e o editor) só se descarregam quando se carrega no botão.
 */
import type { FollowUpDraft, Lead, LeadEmailSendResult } from '@vndesign/core';
import { Reply, Send } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api-client';
import type { SendEmailProps } from './send-email-dialog-window';

const SendEmailDialog = dynamic(() => import('./send-email-dialog-window'), { ssr: false });

/** Botão "Enviar" que abre a janela de confirmação. */
export function SendEmailButton({
  label = 'Enviar',
  variant = 'primary',
  size = 'sm',
  disabled,
  ...props
}: SendEmailProps & { label?: string; variant?: 'primary' | 'outline' | 'secondary' | 'soft'; size?: 'sm' | 'md'; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} disabled={disabled || !!props.lead.anonymized_at}>
        <Send className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden /> {label}
      </Button>
      {open ? <SendEmailDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * "Enviar follow-up": pede à plataforma o próximo follow-up da sequência (modelo
 * do passo preenchido, "Re:" do último email) e abre-o para rever e enviar.
 */
export function FollowUpEmailButton({
  lead,
  compact,
  className,
  variant = 'outline',
  onSent,
}: {
  lead: Lead;
  compact?: boolean;
  className?: string;
  variant?: 'outline' | 'soft';
  onSent?: (result: LeadEmailSendResult) => void;
}) {
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [loading, setLoading] = useState(false);
  // Email devolvido: não há follow-up a enviar para esse endereço (procura-se outro).
  if (lead.status !== 'contactado' || !lead.email || lead.email_bounced_at || lead.anonymized_at) return null;

  async function open() {
    setLoading(true);
    try {
      const { data } = await api<{ data: FollowUpDraft }>(`/leads/${lead.id}/follow-up-draft`);
      setDraft(data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const label = `Enviar follow-up${lead.follow_up_count !== undefined ? ` ${lead.follow_up_count + 1}` : ''} por email`;
  return (
    <>
      {compact ? (
        <Button
          size="icon"
          variant="ghost"
          className={`h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10 ${className ?? ''}`}
          onClick={open}
          loading={loading}
          aria-label={`${label}: #${lead.number} ${lead.company_name}`}
          title={label}
        >
          <Reply className="h-4 w-4" aria-hidden />
        </Button>
      ) : (
        <Button size="sm" variant={variant} onClick={open} loading={loading} className={className}>
          <Reply className="h-3.5 w-3.5" aria-hidden /> Enviar follow-up
        </Button>
      )}
      {draft ? (
        <SendEmailDialog
          lead={lead}
          subject={draft.subject}
          body={draft.body}
          inReplyTo={draft.in_reply_to}
          template={`Follow-up ${draft.step}${draft.template_name ? ` — ${draft.template_name}` : ''}`}
          title={draft.step <= draft.total ? `Enviar follow-up ${draft.step} de ${draft.total}` : `Enviar follow-up ${draft.step}`}
          onSent={onSent}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </>
  );
}
