'use client';

/**
 * Motivo de "Sem interesse": perguntado ao mudar o estado (ficha, Kanban, vários
 * de uma vez) e editável na ficha. Serve para ver em Estatísticas porque se
 * perdem leads. "Sem motivo" também vale.
 */
import { LOST_REASONS, LOST_REASON_LABELS, type Lead, type LostReason } from '@vndesign/core';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useUpdateLead } from '@/lib/queries';

export function LostReasonDialog({
  open,
  subject,
  onPick,
  onCancel,
}: {
  open: boolean;
  /** "#12 Padaria Estrela" ou "3 leads". */
  subject: string;
  onPick: (reason: LostReason | null) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<LostReason | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (!o ? onCancel() : undefined)}
      title={`Porque ${subject.match(/^\d+ leads/) ? 'ficam' : 'fica'} “Sem interesse”?`}
      description={`${subject}. Ajuda a perceber, em Estatísticas, onde se perdem leads.`}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onPick(null)}>
            Sem motivo
          </Button>
          <Button onClick={() => onPick(reason)} disabled={!reason}>
            Guardar
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Motivo</legend>
        {LOST_REASONS.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
            <input type="radio" name="lost-reason" checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-[var(--accent)]" />
            {LOST_REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

/** Linha da ficha (só em "Sem interesse"): mudar o motivo depois. */
export function LostReasonField({ lead }: { lead: Lead }) {
  const update = useUpdateLead(lead.id);
  return (
    <Select
      value={lead.lost_reason ?? ''}
      aria-label="Motivo de “Sem interesse”"
      className="h-8 max-w-xs"
      onChange={(e) =>
        update.mutate({ lost_reason: (e.target.value || null) as LostReason | null }, { onError: (error) => toast.error(errorMessage(error)) })
      }
    >
      <option value="">— Sem motivo —</option>
      {LOST_REASONS.map((r) => (
        <option key={r} value={r}>
          {LOST_REASON_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}
