'use client';

/**
 * "A trabalhar nisto": fixa este projeto no topo do Dashboard até fixares
 * outro (ou tirares a marca). Fica guardado na preferência "dashboard.working_on".
 */
import type { Lead } from '@vndesign/core';
import { Pin, PinOff } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownItem } from '@/components/ui/dropdown';
import { usePreference, useSetPreference } from '@/lib/queries';

export const WORKING_ON_PREFERENCE = 'dashboard.working_on';

export function WorkingOnItem({ lead }: { lead: Lead }) {
  const { data: pinned } = usePreference<string | null>(WORKING_ON_PREFERENCE);
  const save = useSetPreference<string | null>(WORKING_ON_PREFERENCE);
  const isPinned = pinned === lead.id;

  function toggle() {
    // O menu fecha-se (e este item sai do ecrã) antes da resposta: com
    // mutateAsync o aviso aparece mesmo assim.
    void save.mutateAsync(isPinned ? null : lead.id).then(
      () => toast.success(isPinned ? 'Deixou de estar fixado no Dashboard.' : 'Fixado no Dashboard, em "A trabalhar agora".'),
      () => toast.error('Não foi possível guardar.'),
    );
  }

  return (
    <DropdownItem onSelect={toggle} disabled={save.isPending}>
      {isPinned ? <PinOff className="h-4 w-4 text-muted" aria-hidden /> : <Pin className="h-4 w-4 text-muted" aria-hidden />}
      <span>
        {isPinned ? 'Deixar de estar a trabalhar nisto' : 'A trabalhar nisto'}
        <span className="block text-xs text-muted">
          {isPinned ? 'Sai do topo do Dashboard' : 'Fixa este projeto no topo do Dashboard'}
        </span>
      </span>
    </DropdownItem>
  );
}
