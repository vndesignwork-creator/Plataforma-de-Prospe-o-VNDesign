'use client';

/**
 * Motivo de "Sem interesse": perguntado ao mudar o estado (ficha, Kanban, vários
 * de uma vez) e editável na ficha. Serve para ver em Estatísticas porque se
 * perdem leads. "Sem motivo" também vale. Com "Agora não", escolhe-se quando
 * o lead volta sozinho à prospeção (por omissão daqui a 3 meses).
 */
import { DEFAULT_RETRY_MONTHS, LOST_REASONS, LOST_REASON_LABELS, RETRY_MONTHS, formatDate, retryDate, todayIso, type Lead, type LostReason } from '@vndesign/core';
import { Undo2 } from 'lucide-react';
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
  /** retryOn: dia em que volta à prospeção (só com "Agora não"). */
  onPick: (reason: LostReason | null, retryOn: string | null) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<LostReason | null>(null);
  const [today] = useState(() => todayIso());
  const [months, setMonths] = useState(String(DEFAULT_RETRY_MONTHS));
  const retryOn = reason === 'agora_nao' && months ? retryDate(today, Number(months)) : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (!o ? onCancel() : undefined)}
      title={`Porque ${subject.match(/^\d+ leads/) ? 'ficam' : 'fica'} “Sem interesse”?`}
      description={`${subject}. Ajuda a perceber, em Estatísticas, onde se perdem leads.`}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onPick(null, null)}>
            Sem motivo
          </Button>
          <Button onClick={() => onPick(reason, retryOn)} disabled={!reason}>
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
      {reason === 'agora_nao' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <label htmlFor="retry-months">Voltar a tentar</label>
          <Select id="retry-months" value={months} onChange={(e) => setMonths(e.target.value)} className="h-8 w-auto py-0">
            {RETRY_MONTHS.map((m) => (
              <option key={m} value={m}>
                daqui a {m} {m === 1 ? 'mês' : 'meses'}
              </option>
            ))}
            <option value="">Não voltar</option>
          </Select>
          {retryOn ? <span className="text-muted">Volta à Prospeção a {formatDate(retryOn)}.</span> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** Linha da ficha (só em "Sem interesse"): mudar o motivo depois e ver/mudar quando volta à prospeção. */
export function LostReasonField({ lead }: { lead: Lead }) {
  const update = useUpdateLead(lead.id);
  const [today] = useState(() => todayIso());
  const save = (patch: { lost_reason?: LostReason | null; retry_on?: string | null }) =>
    update.mutate(patch, { onError: (error) => toast.error(errorMessage(error)) });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ReasonSelect lead={lead} onChange={(r) => save({ lost_reason: r })} />
      {lead.retry_on ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Volta à Prospeção a {formatDate(lead.retry_on)}
          <button type="button" onClick={() => save({ retry_on: null })} className="rounded px-1.5 py-0.5 text-accent-text hover:bg-surface-3">
            Não voltar
          </button>
        </span>
      ) : lead.lost_reason === 'agora_nao' ? (
        <Select
          value=""
          aria-label="Voltar a tentar"
          className="h-8 w-auto py-0 text-xs"
          onChange={(e) => e.target.value && save({ retry_on: retryDate(today, Number(e.target.value)) })}
        >
          <option value="">Voltar a tentar…</option>
          {RETRY_MONTHS.map((m) => (
            <option key={m} value={m}>
              daqui a {m} {m === 1 ? 'mês' : 'meses'}
            </option>
          ))}
        </Select>
      ) : null}
    </span>
  );
}

function ReasonSelect({ lead, onChange }: { lead: Lead; onChange: (reason: LostReason | null) => void }) {
  return (
    <Select
      value={lead.lost_reason ?? ''}
      aria-label="Motivo de “Sem interesse”"
      className="h-8 max-w-xs"
      onChange={(e) => onChange((e.target.value || null) as LostReason | null)}
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
