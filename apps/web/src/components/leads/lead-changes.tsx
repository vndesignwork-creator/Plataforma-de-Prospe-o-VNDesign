'use client';

/**
 * "O que mudou" num registo "Lead editado" da linha do tempo: cada campo com o
 * valor de antes e o de depois ("Telefone: 912… → 913…") e o botão "Repor",
 * que volta a pôr o valor de antes. Só aparece enquanto o campo ainda tem o
 * valor dessa edição (assim não desfaz uma alteração mais recente).
 */
import {
  EDITABLE_LEAD_FIELDS,
  LEAD_CHANNEL_META,
  LEAD_FIELD_LABELS,
  LEAD_STATUS_META,
  LOST_REASON_LABELS,
  MOBILE_STATUS_META,
  formatCurrency,
  formatDate,
  serviceLabel,
  type Lead,
  type LeadCreateInput,
  type LeadChannel,
  type LeadStatus,
  type LostReason,
  type MobileStatus,
} from '@vndesign/core';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useServiceCatalog } from '@/components/services/services';
import { errorMessage } from '@/lib/api-client';
import { useSectors, useTeamNames, useUpdateLead } from '@/lib/queries';

type Change = { from: unknown; to: unknown };

const EXTRA_LABELS: Record<string, string> = {
  tags: 'Etiquetas',
  pinned_note: 'Nota afixada',
  custom: 'Campos personalizados',
  lost_reason: 'Motivo (sem interesse)',
};

export const changeLabel = (field: string) => (LEAD_FIELD_LABELS as Record<string, string>)[field] ?? EXTRA_LABELS[field] ?? null;

/** Campos que se podem repor (os campos personalizados mudam como um todo, por isso ficam de fora). */
const RESTORABLE = new Set<string>(EDITABLE_LEAD_FIELDS.filter((f) => f !== 'status' && f !== 'custom'));

const isLong = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v) && (v as { long?: unknown }).long === true;
const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => (empty(a) && empty(b)) || JSON.stringify(a) === JSON.stringify(b);

export function LeadChanges({ lead, changes }: { lead: Lead | undefined; changes: Record<string, Change> }) {
  const catalog = useServiceCatalog();
  const { data: sectors } = useSectors(true);
  const { data: team } = useTeamNames();
  const update = useUpdateLead(lead?.id ?? '');

  function show(field: string, v: unknown): string {
    if (isLong(v)) return '(texto longo)';
    if (empty(v)) return '—';
    switch (field) {
      case 'channel':
        return LEAD_CHANNEL_META[v as LeadChannel]?.label ?? String(v);
      case 'status':
        return LEAD_STATUS_META[v as LeadStatus]?.label ?? String(v);
      case 'lost_reason':
        return LOST_REASON_LABELS[v as LostReason] ?? String(v);
      case 'mobile':
        return MOBILE_STATUS_META[v as MobileStatus]?.label ?? String(v);
      case 'estimated_value':
        return formatCurrency(Number(v));
      case 'services':
        return (v as string[]).map((s) => serviceLabel(s, catalog.all)).join(', ');
      case 'sector_id':
        return sectors?.find((s) => s.id === v)?.name ?? 'Setor apagado';
      case 'assigned_to':
        return team?.find((m) => m.user_id === v)?.name ?? 'Antigo membro';
    }
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => `${k}: ${typeof x === 'boolean' ? (x ? 'Sim' : 'Não') : String(x)}`)
        .join(' · ') || '—';
    }
    const text = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDate(text);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }

  async function restore(field: string, change: Change) {
    try {
      await update.mutateAsync({ [field]: empty(change.from) ? null : change.from } as Partial<LeadCreateInput>);
      toast.success(`${changeLabel(field)} reposto.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const rows = Object.entries(changes).filter(([field]) => changeLabel(field));
  if (!rows.length) return null;
  return (
    <ul className="mt-0.5 flex flex-col gap-0.5 text-sm" aria-label="O que mudou">
      {rows.map(([field, change]) => {
        const canRestore =
          !!lead &&
          !lead.anonymized_at &&
          RESTORABLE.has(field) &&
          !isLong(change.from) &&
          same((lead as unknown as Record<string, unknown>)[field], change.to);
        return (
          <li key={field} className="flex items-start gap-2">
            <span className="min-w-0 flex-1 break-words text-muted">
              {changeLabel(field)}: <span className="line-through decoration-muted/60">{show(field, change.from)}</span> →{' '}
              <span className="text-fg">{show(field, change.to)}</span>
            </span>
            {canRestore ? (
              <button
                type="button"
                onClick={() => void restore(field, change)}
                disabled={update.isPending}
                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-accent-text hover:bg-surface-3 disabled:opacity-50"
                aria-label={`Repor ${changeLabel(field)}`}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Repor
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
