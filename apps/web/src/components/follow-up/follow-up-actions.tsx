'use client';

import { LEAD_STATUS_META, formatDate, type Lead } from '@vndesign/core';
import { AlarmClock, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { api, errorMessage } from '@/lib/api-client';
import { useFollowUp, useInvalidateLead, useReschedule, useSettings } from '@/lib/queries';

/**
 * Concluir ou adiar a próxima ação de um lead.
 * compact: dois botões pequenos (lista "Hoje"); normal: menu com mais opções.
 */
/** `quickDone`: com um botão "Feito" (follow-up nos dias por omissão) antes do menu. */
export function FollowUpActions({ lead, compact, quickDone }: { lead: Lead; compact?: boolean; quickDone?: boolean }) {
  const followUp = useFollowUp(lead.id);
  const reschedule = useReschedule();
  const invalidate = useInvalidateLead();
  const { data: settings } = useSettings();
  const days = settings?.follow_up_days ?? 3;
  // Ainda não contactado: "Feito" = primeiro contacto feito (o lead passa a Contactado).
  const first = lead.status === 'identificado';
  const doneLabel = first ? 'Contactado' : 'Feito';

  async function run(action: 'done' | 'snooze', d: number | null) {
    const before = lead.next_action_on;
    try {
      const updated = await followUp.mutateAsync({ action, days: d });
      if (action === 'snooze') {
        // Adiar só muda a data: "Anular" volta à de antes.
        toast.success(`#${lead.number} adiado para ${formatDate(updated.next_action_on)}.`, {
          action: {
            label: 'Anular',
            // mutateAsync: o lead já pode ter saído da lista (e este botão também).
            onClick: () =>
              reschedule.mutateAsync({ leads: [{ id: lead.id, next_action_on: before }] }).then(
                () => toast.success('Data reposta.'),
                (e: unknown) => toast.error(errorMessage(e)),
              ),
          },
        });
      } else {
        const what = first ? `#${lead.number} passou a Contactado.` : 'Feito.';
        // "Anular": o lead volta exatamente como estava (estado, próximo passo e datas de contacto).
        const previous = {
          status: lead.status,
          next_action_on: lead.next_action_on,
          next_action_text: lead.next_action_text,
          first_contact_on: lead.first_contact_on,
          last_follow_up_on: lead.last_follow_up_on,
        };
        toast.success(updated.next_action_on ? `${what} Próximo follow-up a ${formatDate(updated.next_action_on)}.` : `${what} Sem próxima ação.`, {
          action: {
            label: 'Anular',
            onClick: () =>
              void api(`/leads/${lead.id}`, { method: 'PATCH', body: previous })
                .then(() => toast.success(first ? `#${lead.number} voltou a ${LEAD_STATUS_META[lead.status].label}.` : 'Anulado: o próximo passo voltou ao que era.'))
                .catch((e: unknown) => toast.error(errorMessage(e)))
                .finally(() => invalidate(lead.id)),
          },
        });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (compact) {
    return (
      <span className="flex gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10"
          onClick={() => run('done', null)}
          disabled={followUp.isPending}
          aria-label={`${first ? 'Marcar como contactado' : 'Marcar como feito'}: #${lead.number} ${lead.company_name}`}
          title={first ? 'Contactado (passa a Contactado)' : 'Feito'}
        >
          <Check className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10"
          onClick={() => run('snooze', days)}
          disabled={followUp.isPending}
          aria-label={`Adiar ${days} dias: #${lead.number} ${lead.company_name}`}
          title={`Adiar ${days} dias`}
        >
          <AlarmClock className="h-4 w-4" aria-hidden />
        </Button>
      </span>
    );
  }

  return (
    <>
    {quickDone ? (
      <Button
        size="sm"
        variant="outline"
        onClick={() => void run('done', days)}
        disabled={followUp.isPending}
        aria-label={`${first ? 'Marcar como contactado' : 'Marcar como feito'} — follow-up em ${days} dias`}
        title={`${doneLabel} — o próximo follow-up fica daqui a ${days} dias`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden /> {doneLabel}
      </Button>
    ) : null}
    <DropdownRoot>
      <DropdownTrigger className={buttonClasses('outline', 'sm')} disabled={followUp.isPending}>
        <Check className="h-3.5 w-3.5" aria-hidden /> {first ? 'Primeiro contacto' : 'Follow-up'} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{first ? 'Já o contactei (passa a Contactado)' : 'Marcar como feito'}</DropdownLabel>
        <DropdownItem onSelect={() => run('done', days)}>{doneLabel} — follow-up em {days} dias</DropdownItem>
        <DropdownItem onSelect={() => run('done', 7)}>{doneLabel} — follow-up em 7 dias</DropdownItem>
        {first ? null : <DropdownItem onSelect={() => run('done', null)}>Feito — sem próxima ação</DropdownItem>}
        <DropdownSeparator />
        <DropdownLabel>Adiar</DropdownLabel>
        <DropdownItem onSelect={() => run('snooze', 1)}>Para amanhã</DropdownItem>
        <DropdownItem onSelect={() => run('snooze', days)}>{days} dias</DropdownItem>
        <DropdownItem onSelect={() => run('snooze', 7)}>1 semana</DropdownItem>
      </DropdownContent>
    </DropdownRoot>
    </>
  );
}
