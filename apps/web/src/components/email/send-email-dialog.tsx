'use client';

/**
 * "Enviar" um email a um lead pela conta do utilizador (Definições → Email de envio).
 * Mostra o email pronto a rever (Para, Assunto, Mensagem) antes de sair.
 */
import { formatDate, type FollowUpDraft, type Lead, type LeadEmailSendResult } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, Reply, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useAudits, useInvalidateLead, useMailAccount, useSettings } from '@/lib/queries';

interface SendEmailProps {
  lead: Lead;
  subject: string;
  body: string;
  /** Modelo ou origem, para a linha do tempo. */
  template?: string;
  /** Envia a proposta com o PDF em anexo. */
  proposal?: { id: string; filename: string };
  /** Resposta ao último email (follow-up na mesma conversa). */
  inReplyTo?: string | null;
  /** Título da janela (por omissão "Enviar email"). */
  title?: string;
  /** Anexar logo o relatório de diagnóstico do site (a pessoa pode tirar). */
  attachDiagnosis?: boolean;
  onSent?: (result: LeadEmailSendResult) => void;
}

function SendEmailDialog({
  lead,
  subject,
  body,
  template,
  proposal,
  inReplyTo,
  title,
  attachDiagnosis,
  onSent,
  onClose,
}: SendEmailProps & { onClose: () => void }) {
  const { data: account, isLoading } = useMailAccount();
  const { data: settings } = useSettings();
  const { data: audits } = useAudits(lead.id);
  // O relatório de diagnóstico só existe com uma análise do site feita (e a funcionalidade ligada).
  const diagnosisAvailable = !proposal && !!settings?.features.diagnosis_report && !!audits?.some((a) => a.status === 'done');
  const [attach, setAttach] = useState(attachDiagnosis ?? false);
  const withDiagnosis = diagnosisAvailable && attach;
  // Imagens do site (telemóvel e computador) da análise mais recente que as tem.
  const screenshotsAvailable = !proposal && !!settings?.features.site_screenshots && !!audits?.some((a) => a.screenshots.length);
  const [attachShots, setAttachShots] = useState(false);
  const invalidate = useInvalidateLead();
  const qc = useQueryClient();
  const [form, setForm] = useState({ to: lead.email ?? '', subject, body });
  const [bccSelf, setBccSelf] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);
  const copy = bccSelf ?? account?.bcc_self ?? false;

  async function send() {
    setSending(true);
    setErrors({});
    try {
      const { data } = await api<{ data: LeadEmailSendResult }>(proposal ? `/proposals/${proposal.id}/email` : `/leads/${lead.id}/email`, {
        method: 'POST',
        body: {
          ...form,
          bcc_self: copy,
          template,
          ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
          ...(withDiagnosis ? { attach_diagnosis: true } : {}),
          ...(screenshotsAvailable && attachShots ? { attach_screenshots: true } : {}),
        },
      });
      const next = data.next_action_on ? ` Próximo: ${data.next_action_text ?? 'follow-up'} a ${formatDate(data.next_action_on)}.` : '';
      toast.success(
        data.follow_up_step
          ? `Follow-up ${data.follow_up_step} enviado para ${data.sent_to}.${next}`
          : `Email enviado para ${data.sent_to}.` +
              (data.status_changed ? ` Estado atualizado${data.next_action_on ? ` — follow-up a ${formatDate(data.next_action_on)}` : ''}.` : ''),
      );
      void qc.invalidateQueries({ queryKey: ['today'] });
      invalidate(lead.id);
      void qc.invalidateQueries({ queryKey: ['mail-account'] });
      onSent?.(data);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const ready = !isLoading && account;
  return (
    <Dialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={title ?? (proposal ? 'Enviar a proposta por email' : 'Enviar email')}
      description={ready ? `De: ${account.from_name} <${account.from_email}>` : undefined}
      className="max-w-2xl"
      footer={
        ready ? (
          <>
            <span className="mr-auto text-xs text-muted tabular">
              Hoje: {account.sent_today} de {account.daily_limit}
            </span>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={send} loading={sending}>
              <Send className="h-4 w-4" aria-hidden /> Enviar
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        )
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted">A carregar…</p>
      ) : !account ? (
        <div className="flex flex-col items-start gap-3 text-sm">
          <p>Para enviar pela plataforma, liga primeiro a tua conta de email (Gmail, Hostinger ou outro). Demora 2 minutos.</p>
          <Link href="/definicoes/email" className={buttonClasses('primary', 'sm')}>
            Ligar a conta de email
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          noValidate
        >
          <Field label="Para" required error={errors.to?.[0]} hint={lead.email ? undefined : 'Este lead não tem email: escreve o endereço.'}>
            <Input type="email" inputMode="email" autoComplete="off" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <Field label="Assunto" required error={errors.subject?.[0]}>
            <Input value={form.subject} maxLength={300} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label="Mensagem" required error={errors.body?.[0]}>
            <Textarea rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="leading-relaxed" />
          </Field>
          {proposal ? (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Paperclip className="h-4 w-4" aria-hidden /> Anexo: {proposal.filename}
            </p>
          ) : null}
          {diagnosisAvailable ? (
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
              <Paperclip className="h-4 w-4 text-muted" aria-hidden />
              Anexar o relatório de diagnóstico do site (PDF)
            </label>
          ) : null}
          {screenshotsAvailable ? (
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={attachShots} onChange={(e) => setAttachShots(e.target.checked)} />
              <Paperclip className="h-4 w-4 text-muted" aria-hidden />
              Anexar as imagens do site (telemóvel e computador)
            </label>
          ) : null}
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={copy} onChange={(e) => setBccSelf(e.target.checked)} />
            Enviar-me uma cópia (cópia oculta)
          </label>
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}

/** Botão "Enviar" que abre a janela de confirmação. */
export function SendEmailButton({
  label = 'Enviar',
  variant = 'primary',
  size = 'sm',
  disabled,
  ...props
}: SendEmailProps & { label?: string; variant?: 'primary' | 'outline' | 'secondary'; size?: 'sm' | 'md'; disabled?: boolean }) {
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
export function FollowUpEmailButton({ lead, compact, className }: { lead: Lead; compact?: boolean; className?: string }) {
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [loading, setLoading] = useState(false);
  if (lead.status !== 'contactado' || !lead.email || lead.anonymized_at) return null;

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
        <Button size="sm" variant="outline" onClick={open} loading={loading} className={className}>
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
          onClose={() => setDraft(null)}
        />
      ) : null}
    </>
  );
}
