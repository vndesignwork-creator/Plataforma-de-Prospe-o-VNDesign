'use client';

/**
 * Pedir indicação: depois de entregar, o cliente satisfeito é a forma mais
 * barata de arranjar trabalho. Email pronto para rever e enviar, "Já pedi"
 * para quando foi por outra via, e a lista de quem ele já indicou.
 */
import { REFERRAL_TEMPLATE, buildReferralEmail, formatDate, formatSignature, leadPath, referralCountLabel, type Lead } from '@vndesign/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api-client';
import { useSignature } from '@/lib/queries';
import { SectionHeader } from './section-header';

interface Referrals {
  referred: { id: string; number: number; company_name: string; status: string }[];
  asked_at: string | null;
}

export function ReferralsSection({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { data: signature } = useSignature();
  const { data } = useQuery({
    queryKey: ['referrals', lead.id],
    queryFn: () => api<{ data: Referrals }>(`/leads/${lead.id}/referrals`).then((r) => r.data),
  });
  const asked = useMutation({
    mutationFn: () => api<{ data: Referrals }>(`/leads/${lead.id}/referrals`, { method: 'POST' }).then((r) => r.data),
    onSuccess: (fresh) => {
      qc.setQueryData(['referrals', lead.id], fresh);
      void qc.invalidateQueries({ queryKey: ['activities', lead.id] });
      toast.success('Ficou registado que já pediste.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const email = buildReferralEmail({
    company: lead.company_name,
    contact: lead.contact_name,
    project: lead.project_title ?? null,
    signature: signature ? formatSignature(signature) : null,
  });
  const count = data?.referred.length ?? 0;

  return (
    <section aria-labelledby={`referrals-${lead.id}`} className="border-t border-border px-5 py-4">
      <SectionHeader
        id={`referrals-${lead.id}`}
        icon={UserPlus}
        title="Pedir indicação"
        summary={referralCountLabel(count)}
        action={
          !lead.anonymized_at ? (
            <SendEmailButton
              lead={lead}
              subject={email.subject}
              body={email.body}
              template={REFERRAL_TEMPLATE}
              title={`Pedir indicação · ${lead.company_name}`}
              label="Email de indicação"
              variant={data?.asked_at ? 'outline' : 'soft'}
            />
          ) : null
        }
      />
      <p className="mt-1 text-sm text-muted">
        {data?.asked_at
          ? `Pediste a ${formatDate(data.asked_at.slice(0, 10))}.`
          : 'Ainda não pediste. Quem já trabalhou contigo é quem melhor te apresenta a outros.'}{' '}
        {!lead.anonymized_at && !data?.asked_at ? (
          <Button size="sm" variant="ghost" className="align-baseline" onClick={() => asked.mutate()} loading={asked.isPending}>
            <Check className="h-3.5 w-3.5" aria-hidden /> Já pedi
          </Button>
        ) : null}
      </p>
      {count ? (
        <ul className="mt-2 flex flex-wrap gap-2 text-sm" aria-label="Clientes que este indicou">
          {data!.referred.map((r) => (
            <li key={r.id}>
              <Link href={leadPath(r)} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs hover:text-accent-text">
                <span className="text-muted tabular">#{r.number}</span> {r.company_name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
