'use client';

/**
 * Aniversário do site: quando faz anos que o projeto foi entregue, com o email
 * já escrito. Um ano depois da entrega (e em cada ano a seguir) a plataforma
 * cria sozinha a tarefa e avisa; aqui dá para enviar o email quando quiseres.
 */
import {
  ANNIVERSARY_REMIND_DAYS,
  buildAnniversaryEmail,
  daysUntil,
  formatDate,
  nextAnniversary,
  todayIso,
  type Lead,
} from '@vndesign/core';
import { Cake } from 'lucide-react';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { useSignature } from '@/lib/queries';
import { SectionHeader } from './section-header';

export function AnniversarySection({ lead }: { lead: Lead }) {
  const { data: signature } = useSignature();
  if (!lead.project_completed_at) return null;
  const today = todayIso();
  const { on, years } = nextAnniversary(lead.project_completed_at, today);
  if (years < 1) return null;
  const days = daysUntil(on, today);
  const soon = days <= ANNIVERSARY_REMIND_DAYS;
  const email = buildAnniversaryEmail({
    company: lead.company_name,
    contactName: lead.contact_name,
    years,
    on,
    sender: { name: signature?.full_name ?? null, company: signature?.company ?? null },
  });

  return (
    <section aria-labelledby={`anniversary-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`anniversary-${lead.id}`}
        icon={Cake}
        title="Aniversário do site"
        summary={soon ? `faz ${years} ano${years === 1 ? '' : 's'} a ${formatDate(on)}` : null}
        action={
          !lead.anonymized_at ? (
            <SendEmailButton
              lead={lead}
              subject={email.subject}
              body={email.body}
              template="Aniversário do site"
              title={`Email de aniversário · ${lead.company_name}`}
              label="Email de aniversário"
              variant={soon ? 'soft' : 'outline'}
            />
          ) : null
        }
      />
      <p className="mt-1 text-sm text-muted">
        Entregue a {formatDate(lead.project_completed_at.slice(0, 10))}.{' '}
        {days === 0
          ? `Faz ${years} ano${years === 1 ? '' : 's'} hoje. 🎂`
          : `Faz ${years} ano${years === 1 ? '' : 's'} a ${formatDate(on)} (daqui a ${days} dia${days === 1 ? '' : 's'}).`}{' '}
        {soon ? 'Boa altura para propor uma revisão.' : `A tarefa aparece ${ANNIVERSARY_REMIND_DAYS} dias antes.`}
      </p>
    </section>
  );
}
