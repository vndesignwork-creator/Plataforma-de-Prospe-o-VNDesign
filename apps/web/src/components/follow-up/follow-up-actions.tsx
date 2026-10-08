'use client';

import { formatDate, type Lead } from '@vndesign/core';
import { AlarmClock, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { errorMessage } from '@/lib/api-client';
import { useFollowUp, useSettings } from '@/lib/queries';

/**
 * Concluir ou adiar a próxima ação de um lead.
 * compact: dois botões pequenos (lista "Hoje"); normal: menu com mais opções.
 */
export function FollowUpActions({ lead, compact }: { lead: Lead; compact?: boolean }) {
  const followUp = useFollowUp(lead.id);
  const { data: settings } = useSettings();
  const days = settings?.follow_up_days ?? 3;

  async function run(action: 'done' | 'snooze', d: number | null) {
    try {
      const updated = await followUp.mutateAsync({ action, days: d });
      toast.success(
        action === 'snooze'
          ? `#${lead.number} adiado para ${formatDate(updated.next_action_on)}.`
          : updated.next_action_on
            ? `Feito. Próximo follow-up a ${formatDate(updated.next_action_on)}.`
            : 'Feito. Sem próxima ação.',
      );
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
          className="h-8 w-8"
          onClick={() => run('done', null)}
          disabled={followUp.isPending}
          aria-label={`Marcar como feito: #${lead.number} ${lead.company_name}`}
          title="Feito"
        >
          <Check className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
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
    <DropdownRoot>
      <DropdownTrigger className={buttonClasses('outline', 'sm')} disabled={followUp.isPending}>
        <Check className="h-3.5 w-3.5" aria-hidden /> Follow-up <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Marcar como feito</DropdownLabel>
        <DropdownItem onSelect={() => run('done', days)}>Feito — novo follow-up em {days} dias</DropdownItem>
        <DropdownItem onSelect={() => run('done', 7)}>Feito — novo follow-up em 7 dias</DropdownItem>
        <DropdownItem onSelect={() => run('done', null)}>Feito — sem próxima ação</DropdownItem>
        <DropdownSeparator />
        <DropdownLabel>Adiar</DropdownLabel>
        <DropdownItem onSelect={() => run('snooze', 1)}>Para amanhã</DropdownItem>
        <DropdownItem onSelect={() => run('snooze', days)}>{days} dias</DropdownItem>
        <DropdownItem onSelect={() => run('snooze', 7)}>1 semana</DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
