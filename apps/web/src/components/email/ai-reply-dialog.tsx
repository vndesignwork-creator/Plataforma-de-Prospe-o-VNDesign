'use client';

/**
 * "Responder com IA": a partir do que o lead escreveu, a IA escreve a resposta
 * no teu tom. Nada sai daqui sozinho — lês, mudas o que quiseres e envias.
 */
import {
  REPLY_GOALS,
  REPLY_GOAL_LABELS,
  REPLY_TEXT_MAX,
  REPLY_TONES,
  REPLY_TONE_LABELS,
  type Lead,
  type ReplyDraft,
  type ReplyGoal,
  type ReplyTone,
} from '@vndesign/core';
import { Copy, Sparkles, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { SendEmailButton } from './send-email-dialog';

export function AiReplyDialog({
  lead,
  subject,
  text,
  inReplyTo,
  onClose,
  onSent,
}: {
  lead: Lead;
  /** Assunto do email do lead (para o "Re:"). */
  subject: string;
  /** O que o lead escreveu (quando a plataforma o guardou). */
  text: string | null;
  inReplyTo?: string | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [leadText, setLeadText] = useState(text ?? '');
  const [goal, setGoal] = useState<ReplyGoal>('responder');
  const [tone, setTone] = useState<ReplyTone>('profissional');
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<ReplyDraft | null>(null);
  const [body, setBody] = useState('');
  const [writing, setWriting] = useState(false);

  async function write() {
    if (leadText.trim().length < 5) {
      toast.error('Cola o que o lead escreveu.');
      return;
    }
    setWriting(true);
    try {
      const { data } = await api<{ data: ReplyDraft }>(`/leads/${lead.id}/ai-reply`, {
        method: 'POST',
        body: { text: leadText.trim(), subject, goal, tone, notes: notes.trim() },
      });
      setDraft(data);
      setBody(data.body);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setWriting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      toast.success('Resposta copiada.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Responder com IA"
      description={`A IA escreve a resposta a ${lead.company_name}. Lê, muda o que quiseres e só depois envia.`}
      className="sm:max-w-2xl"
      footer={
        draft ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => void write()} loading={writing}>
              <Wand2 className="h-4 w-4" aria-hidden /> Escrever outra vez
            </Button>
            <Button variant="outline" onClick={() => void copy()}>
              <Copy className="h-4 w-4" aria-hidden /> Copiar
            </Button>
            <SendEmailButton
              lead={lead}
              subject={draft.subject}
              body={body}
              template="Resposta com IA"
              inReplyTo={inReplyTo ?? null}
              title={`Responder a ${lead.company_name}`}
              label="Rever e enviar"
              size="md"
              onSent={() => {
                onSent?.();
                onClose();
              }}
            />
          </div>
        ) : (
          <Button onClick={() => void write()} loading={writing}>
            <Sparkles className="h-4 w-4" aria-hidden /> Escrever resposta
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="O que o lead escreveu"
          hint={text ? 'Lido do email que chegou. Podes cortar o que não interessa.' : 'A plataforma não guardou o texto deste email: cola-o aqui.'}
        >
          <Textarea rows={6} value={leadText} onChange={(e) => setLeadText(e.target.value)} maxLength={REPLY_TEXT_MAX} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="O que queres conseguir">
            <Select value={goal} onChange={(e) => setGoal(e.target.value as ReplyGoal)}>
              {REPLY_GOALS.map((g) => (
                <option key={g} value={g}>
                  {REPLY_GOAL_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tom">
            <Select value={tone} onChange={(e) => setTone(e.target.value as ReplyTone)}>
              {REPLY_TONES.map((t) => (
                <option key={t} value={t}>
                  {REPLY_TONE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Queres dizer mais alguma coisa?" hint="Opcional. Ex.: só tenho agenda a partir de março.">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="ex.: proponho uma chamada de 15 minutos na quinta" />
        </Field>

        {draft ? (
          <>
            {draft.summary ? (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
                <strong className="text-fg">O lead diz:</strong> {draft.summary}
              </p>
            ) : null}
            <Field label="Assunto">
              <Input value={draft.subject} readOnly />
            </Field>
            <Field label="Resposta" hint="Podes mudar à vontade antes de enviar.">
              <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            {draft.tip ? (
              <p className="flex items-start gap-2 text-xs text-muted">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>Dica (não vai no email):</strong> {draft.tip}
                </span>
              </p>
            ) : null}
            <p className="text-xs text-muted">Escrita por {draft.model}. Confirma os factos antes de enviar.</p>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
