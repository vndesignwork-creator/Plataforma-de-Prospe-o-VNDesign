'use client';

/**
 * "Ponto de situação" (cartão Projeto): email ao cliente com o que foi feito
 * desde o último, os próximos passos e o link da página de acompanhamento
 * (que já é o relatório sempre atualizado). Sem email do cliente (ou sem a
 * conta de envio ligada), copia o texto.
 */
import { PROJECT_UPDATE_TEMPLATE, buildProjectUpdate, formatSignature, todayIso, type Lead } from '@vndesign/core';
import { ClipboardCopy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button } from '@/components/ui/button';
import { useActivities, useDeliverables, useLeadTasks, useMailAccount, useMeetings, usePayments, useProjectInfo, useSettings, useSignature } from '@/lib/queries';
import { shareUrl } from './share-section';

const lisbonDay = (iso: string) => todayIso(new Date(iso));

export function ProjectUpdateButton({ lead }: { lead: Lead }) {
  const { data: settings } = useSettings();
  const features = settings?.features;
  const { data: tasks } = useLeadTasks(lead.id);
  const { data: deliverables } = useDeliverables(lead.id, !!features?.deliverables);
  const { data: meetings } = useMeetings(lead.id, !!features?.meetings);
  const { data: payments } = usePayments(lead.id, !!features?.payments);
  const { data: info } = useProjectInfo(lead.id);
  const { data: activities } = useActivities(lead.id);
  const { data: signature } = useSignature();
  const { data: account, isPending: accountPending } = useMailAccount();
  // Hora fixa ao abrir (para escolher a próxima reunião).
  const [now] = useState(() => Date.now());
  if (lead.anonymized_at) return null;

  // Desde o último ponto de situação enviado (os registos vêm do mais recente para o mais antigo).
  const last = (activities ?? []).find((a) => a.type === 'email_sent' && (a.payload as { template?: string }).template === PROJECT_UPDATE_TEMPLATE);
  const meeting = (meetings ?? [])
    .filter((m) => !m.canceled_at && new Date(m.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const nextPayment = (payments ?? []).filter((p) => !p.paid_on).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))[0];
  const draft = buildProjectUpdate({
    company: lead.company_name,
    projectTitle: lead.project_title ?? null,
    contact: lead.contact_name,
    since: last ? lisbonDay(last.created_at) : null,
    tasks: tasks ?? [],
    deliverables: features?.deliverables ? (deliverables ?? []) : [],
    meeting: meeting ?? null,
    nextPayment: nextPayment ? { description: nextPayment.description, amount: nextPayment.amount, due_on: nextPayment.due_on } : null,
    shareUrl: features?.client_page && info?.share_token ? shareUrl(info.share_token) : null,
    signature: signature ? formatSignature(signature) || null : null,
  });
  const hint = last ? `O último foi a ${lisbonDay(last.created_at).split('-').reverse().join('/')}.` : 'Ainda não enviaste nenhum.';

  // Enquanto não se sabe se há conta de envio, o botão espera (senão copiava em vez de abrir o email).
  if (lead.email && accountPending) {
    return (
      <Button size="sm" variant="outline" disabled>
        <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> Ponto de situação
      </Button>
    );
  }
  // Com email do cliente e a conta de envio ligada: rever e enviar. Senão, copiar o texto.
  if (lead.email && account) {
    return (
      <span title={`Email ao cliente com o que foi feito e os próximos passos. ${hint}`}>
        <SendEmailButton lead={lead} subject={draft.subject} body={draft.body} template={PROJECT_UPDATE_TEMPLATE} title="Ponto de situação" label="Ponto de situação" variant="outline" />
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      title={`${lead.email ? 'Sem conta de email ligada' : 'O cliente não tem email'}: copia o texto (WhatsApp ou o teu email). ${hint}`}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(draft.body)
          .then(() =>
            toast.success(
              lead.email
                ? 'Ponto de situação copiado: cola-o no teu email (para enviar pela plataforma, liga a conta em Definições → Email de envio).'
                : 'Ponto de situação copiado (o cliente não tem email): cola-o no WhatsApp.',
            ),
          )
          .catch(() => toast.error('Não foi possível copiar.'));
      }}
    >
      <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> Ponto de situação
    </Button>
  );
}
