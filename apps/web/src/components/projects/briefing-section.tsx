'use client';

/**
 * Briefing online do projeto: criar o link (/b/<código>), enviá-lo ao cliente e
 * ver as respostas e os ficheiros que ele enviou.
 */
import { formatDateTime, type Lead } from '@vndesign/core';
import { ClipboardList, Copy, Download, ExternalLink, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api-client';
import { useBriefing, useBriefingAction, useSignature } from '@/lib/queries';
import { whatsappUrl } from '@/lib/utils';
import { SectionHeader } from './section-header';

const briefingUrl = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/b/${token}`;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function BriefingSection({ lead }: { lead: Lead }) {
  const { data: briefing, isLoading } = useBriefing(lead.id);
  const action = useBriefingAction(lead.id);
  const { data: signature } = useSignature();
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const url = briefing ? briefingUrl(briefing.token) : null;
  const message = url
    ? `Olá${lead.contact_name ? ` ${lead.contact_name}` : ''}! Para arrancarmos com o projeto, preciso de algumas informações. Leva uns 10 minutos e pode juntar o logótipo, fotos e textos:\n${url}\n\nObrigado!\n${signature?.full_name ?? ''}`
    : '';
  const wa = url ? whatsappUrl(lead.phone, message) : null;
  const answered = briefing?.status === 'respondido';

  async function request() {
    try {
      await action.mutateAsync({});
      toast.success(briefing ? 'Briefing pedido de novo: o cliente pode completar ou corrigir as respostas.' : 'Link do briefing criado.');
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
    <section aria-labelledby={`briefing-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`briefing-${lead.id}`}
        icon={ClipboardList}
        title="Briefing"
        summary={briefing ? <Badge tone={answered ? 'success' : 'warning'}>{answered ? 'Respondido' : 'À espera do cliente'}</Badge> : null}
        action={
          !briefing ? (
            <Button size="sm" variant="outline" onClick={request} loading={action.isPending}>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Pedir briefing
            </Button>
          ) : null
        }
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : !briefing ? (
        <p className="mt-2 text-sm text-muted">
          Um formulário para o cliente: objetivos, cores, referências, conteúdos e acessos, com ficheiros. Ao responder, a fase passa a “Em produção”.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {answered && briefing.submitted_at ? <p className="text-xs text-muted">Recebido a {formatDateTime(briefing.submitted_at)}.</p> : null}
          <div className="flex flex-wrap gap-2">
            {answered ? (
              <Button size="sm" onClick={() => setShow(true)}>
                Ver respostas{briefing.files.length ? ` e ${briefing.files.length} ficheiro${briefing.files.length === 1 ? '' : 's'}` : ''}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar link
            </Button>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'sm')}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
              </a>
            ) : null}
            {lead.email ? (
              <SendEmailButton lead={lead} subject={`Briefing do projeto — ${lead.company_name}`} body={message} template="Briefing" label="Email" variant="outline" />
            ) : null}
            <a href={url!} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ver como o cliente
            </a>
            {answered ? (
              <Button size="sm" variant="ghost" onClick={request} loading={action.isPending}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Pedir de novo
              </Button>
            ) : null}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfirm(true)} aria-label="Apagar o briefing">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      )}
      {show && briefing ? (
        <Dialog open onOpenChange={(o) => (!o ? setShow(false) : undefined)} title="Briefing" description={lead.company_name} className="max-w-2xl">
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-3">
              {briefing.questions.map((q, i) => (
                <div key={i}>
                  <dt className="text-sm font-semibold">{q}</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-line text-muted">{briefing.answers[i]?.trim() || '—'}</dd>
                </div>
              ))}
            </dl>
            {briefing.files.length ? (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Ficheiros</h3>
                <ul className="flex flex-col gap-1" aria-label="Ficheiros do briefing">
                  {briefing.files.map((f, i) => (
                    <li key={f.path}>
                      <a href={`/api/v1/leads/${lead.id}/briefing/files/${i}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:underline">
                        <Download className="h-3.5 w-3.5" aria-hidden /> {f.name} <span className="text-xs text-muted">({kb(f.size)})</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Apagar o briefing?"
        description="O link deixa de funcionar e as respostas e os ficheiros são apagados."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              loading={action.isPending}
              onClick={async () => {
                try {
                  await action.mutateAsync({ remove: true });
                  setConfirm(false);
                  toast.success('Briefing apagado.');
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              Apagar
            </Button>
          </>
        }
      />
    </section>
  );
}
