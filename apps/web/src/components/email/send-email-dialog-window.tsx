'use client';

/**
 * A janela "Enviar email" (Para, Assunto, Mensagem com o editor). Fica num ficheiro
 * à parte para só ser descarregada quando se abre (ver send-email-dialog.tsx).
 */
import { formatDate, toPlainText, type Lead, type LeadEmailSendResult } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, Send } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DictateButton } from '@/components/ui/dictate-button';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor';
import { SignatureLogoPreview } from './signature-logo-preview';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { EmailCheckHint } from './email-check-hint';
import { useAudits, useInvalidateLead, useMailAccount, useSettings } from '@/lib/queries';

export interface SendEmailProps {
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

export default function SendEmailDialog({
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
  const editor = useRef<RichTextEditorHandle>(null);
  const [bccSelf, setBccSelf] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);
  const copy = bccSelf ?? account?.bcc_self ?? false;

  async function send() {
    // O editor pode ter só um parágrafo vazio: conta como mensagem em branco.
    if (!toPlainText(form.body).trim()) {
      setErrors({ body: ['Escreve a mensagem.'] });
      return;
    }
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
          <div className="flex flex-col">
            <Field
              label="Para"
              required
              error={errors.to?.[0]}
              hint={
                !lead.email
                  ? 'Este lead não tem email: escreve o endereço.'
                  : lead.email_bounced_at && form.to.trim().toLowerCase() === lead.email.trim().toLowerCase()
                    ? 'Atenção: o último email para este endereço foi devolvido (não existe). Confirma ou escreve outro.'
                    : undefined
              }
            >
              <Input type="email" inputMode="email" autoComplete="off" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </Field>
            <EmailCheckHint email={form.to} />
          </div>
          <Field label="Assunto" required error={errors.subject?.[0]}>
            <Input value={form.subject} maxLength={300} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label="Mensagem" required error={errors.body?.[0]}>
            <RichTextEditor
              label="Mensagem"
              value={form.body}
              onChange={(body) => setForm((f) => ({ ...f, body }))}
              handleRef={editor}
              toolbarEnd={
                <DictateButton
                  size="sm"
                  className="h-8 border-0"
                  target={{
                    insert: (spoken) => editor.current?.insertText(` ${spoken.trim()}`),
                    snapshot: () => form.body,
                    restore: (html) => setForm((f) => ({ ...f, body: html })),
                  }}
                />
              }
              minHeight="14rem"
              footer={<SignatureLogoPreview body={form.body} />}
            />
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

