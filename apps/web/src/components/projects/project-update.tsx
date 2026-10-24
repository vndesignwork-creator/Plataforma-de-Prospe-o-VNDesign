'use client';

/**
 * "Ponto de situação" (cartão Projeto): email ao cliente com o que foi feito
 * desde o último, os próximos passos e o link da página de acompanhamento
 * (que já é o relatório sempre atualizado). Sem email do cliente (ou sem a
 * conta de envio ligada), copia o texto.
 */
import { PROJECT_UPDATE_TEMPLATE, WELCOME_TEMPLATE, buildProjectUpdate, buildWelcomeEmail, formatSignature, todayIso, type Lead } from '@vndesign/core';
import { ClipboardCopy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button } from '@/components/ui/button';
import {
  useActivities,
  useBriefing,
  useDeliverables,
  useLeadTasks,
  useLogActivity,
  useMailAccount,
  useMeetings,
  usePayments,
  useProjectInfo,
  useSettings,
  useSignature,
} from '@/lib/queries';
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

  return (
    <DraftEmailButton
      lead={lead}
      draft={draft}
      template={PROJECT_UPDATE_TEMPLATE}
      label="Ponto de situação"
      title={`Email ao cliente com o que foi feito e os próximos passos. ${hint}`}
      copyHint={hint}
    />
  );
}

/**
 * "Boas-vindas" (cartão Projeto, enquanto não foi enviado): o primeiro email ao
 * novo cliente com o link do briefing, a reunião de arranque, os primeiros
 * passos, a entrega prevista, o plano de pagamentos e a página do projeto.
 * Revê-se antes de enviar (ou copia-se, como o ponto de situação).
 */
export function WelcomeButton({ lead }: { lead: Lead }) {
  const { data: settings } = useSettings();
  const features = settings?.features;
  const { data: tasks } = useLeadTasks(lead.id);
  const { data: meetings } = useMeetings(lead.id, !!features?.meetings);
  const { data: payments } = usePayments(lead.id, !!features?.payments);
  const { data: briefing } = useBriefing(lead.id, !!features?.briefing);
  const { data: info } = useProjectInfo(lead.id);
  const { data: activities, isPending } = useActivities(lead.id);
  const { data: signature } = useSignature();
  const [now] = useState(() => Date.now());
  if (lead.anonymized_at || isPending) return null;
  // Já enviado (ou copiado): daqui em diante é o ponto de situação.
  const sent = (activities ?? []).some(
    (a) => (a.type === 'email_sent' || a.type === 'email_copied') && (a.payload as { template?: string }).template === WELCOME_TEMPLATE,
  );
  if (sent) return null;

  const meeting = (meetings ?? [])
    .filter((m) => !m.canceled_at && new Date(m.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const draft = buildWelcomeEmail({
    company: lead.company_name,
    projectTitle: lead.project_title ?? null,
    contact: lead.contact_name,
    dueOn: info?.due_on ?? null,
    tasks: [...(tasks ?? [])].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')),
    payments: [...(payments ?? [])].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')),
    meeting: meeting ?? null,
    shareUrl: features?.client_page && info?.share_token ? shareUrl(info.share_token) : null,
    briefingUrl: features?.briefing && briefing && briefing.status === 'pendente' ? `${window.location.origin}/b/${briefing.token}` : null,
    signature: signature ? formatSignature(signature) || null : null,
  });
  return (
    <DraftEmailButton
      lead={lead}
      draft={draft}
      template={WELCOME_TEMPLATE}
      label="Boas-vindas"
      title="Primeiro email ao novo cliente: briefing, reunião de arranque, primeiros passos, pagamentos e a página do projeto."
    />
  );
}

/** Com email do cliente e a conta de envio ligada: rever e enviar. Senão, copiar o texto (e fica registado). */
function DraftEmailButton({
  lead,
  draft,
  template,
  label,
  title,
  copyHint = '',
}: {
  lead: Lead;
  draft: { subject: string; body: string };
  template: string;
  label: string;
  title: string;
  copyHint?: string;
}) {
  const { data: account, isPending: accountPending } = useMailAccount();
  const log = useLogActivity(lead.id);
  // Enquanto não se sabe se há conta de envio, o botão espera (senão copiava em vez de abrir o email).
  if (lead.email && accountPending) {
    return (
      <Button size="sm" variant="outline" disabled>
        <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> {label}
      </Button>
    );
  }
  if (lead.email && account) {
    return (
      <span title={title}>
        <SendEmailButton lead={lead} subject={draft.subject} body={draft.body} template={template} title={label} label={label} variant="outline" />
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      title={`${lead.email ? 'Sem conta de email ligada' : 'O cliente não tem email'}: copia o texto (WhatsApp ou o teu email). ${copyHint}`.trim()}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(draft.body)
          .then(() => {
            log.mutate({ type: 'email_copied', payload: { template, part: 'all' } });
            toast.success(
              lead.email
                ? `${label} copiado: cola-o no teu email (para enviar pela plataforma, liga a conta em Definições → Email de envio).`
                : `${label} copiado (o cliente não tem email): cola-o no WhatsApp.`,
            );
          })
          .catch(() => toast.error('Não foi possível copiar.'));
      }}
    >
      <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> {label}
    </Button>
  );
}
