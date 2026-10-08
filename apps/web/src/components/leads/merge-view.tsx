'use client';

import {
  LEAD_CHANNEL_META,
  LEAD_FIELD_LABELS,
  LEAD_STATUS_META,
  MOBILE_STATUS_META,
  formatCurrency,
  formatDate,
  type LeadChannel,
  type LeadStatus,
  type MobileStatus,
  type Sector,
} from '@vndesign/core';
import { GitMerge } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateLead, useLead, useSectors } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const MERGE_DRAFT_KEY = 'vnd-merge-draft';

const FIELDS = [
  'company_name', 'sector_id', 'website', 'city', 'address', 'problems', 'pagespeed', 'mobile',
  'email', 'phone', 'contact_name', 'status', 'channel', 'first_contact_on', 'last_follow_up_on',
  'next_action_text', 'next_action_on', 'estimated_value', 'notes', 'approach_angle', 'source_url',
  'suggested_on', 'email_subject', 'email_body',
] as const;
type MergeField = (typeof FIELDS)[number];

/** Campos de texto longo onde faz sentido manter os dois valores. */
const CONCATENABLE: MergeField[] = ['problems', 'notes', 'approach_angle'];

type Values = Partial<Record<MergeField, unknown>>;
type Choice = 'primary' | 'other' | 'both';

const blank = (v: unknown) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

function display(field: MergeField, value: unknown, sectors: Sector[]): string {
  if (blank(value)) return '—';
  switch (field) {
    case 'sector_id': {
      const s = sectors.find((x) => x.id === value);
      return s ? `${s.emoji ?? ''} ${s.name}`.trim() : '—';
    }
    case 'status':
      return LEAD_STATUS_META[value as LeadStatus]?.label ?? String(value);
    case 'channel':
      return LEAD_CHANNEL_META[value as LeadChannel]?.label ?? String(value);
    case 'mobile':
      return MOBILE_STATUS_META[value as MobileStatus]?.label ?? String(value);
    case 'estimated_value':
      return formatCurrency(Number(value));
    case 'first_contact_on':
    case 'last_follow_up_on':
    case 'next_action_on':
    case 'suggested_on':
      return formatDate(String(value));
    default:
      return String(value);
  }
}

// O rascunho vem do formulário "Novo lead" (sessionStorage).
const subscribeNoop = () => () => {};
function readDraft(): string | null {
  try {
    return sessionStorage.getItem(MERGE_DRAFT_KEY);
  } catch {
    return null;
  }
}

export function MergeView({ id, otherId, useDraft }: { id: string; otherId?: string; useDraft?: boolean }) {
  const router = useRouter();
  const invalidate = useInvalidateLead();
  const primary = useLead(id);
  const other = useLead(otherId ?? '');
  const { data: sectors = [] } = useSectors(true);
  const draftRaw = useSyncExternalStore(subscribeNoop, readDraft, () => null);
  const draft = useMemo(() => (useDraft && draftRaw ? (JSON.parse(draftRaw) as Values) : null), [useDraft, draftRaw]);
  const otherValues: Values | null = otherId ? ((other.data as Values | undefined) ?? null) : draft;

  const rows = useMemo(() => {
    if (!primary.data || !otherValues) return [];
    const p = primary.data as unknown as Values;
    return FIELDS.filter((f) => !blank(otherValues[f]) && String(otherValues[f]) !== String(p[f] ?? ''))
      .filter((f) => !(f === 'mobile' && otherValues[f] === 'desconhecido'))
      .map((f) => ({ field: f, primary: p[f], other: otherValues[f], defaultChoice: (blank(p[f]) ? 'other' : 'primary') as Choice }));
  }, [primary.data, otherValues]);

  const [choices, setChoices] = useState<Partial<Record<MergeField, Choice>>>({});
  const [saving, setSaving] = useState(false);
  const choiceOf = (f: MergeField, d: Choice) => choices[f] ?? d;

  if (primary.isLoading || (otherId && other.isLoading)) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (!primary.data || !otherValues) {
    return (
      <EmptyState title="Nada para juntar">
        Não encontrámos o lead {otherId ? 'a juntar' : 'nem os dados do novo registo'}.{' '}
        <Link href={`/leads/${id}`} className="text-accent-text underline">
          Voltar à ficha
        </Link>
      </EmptyState>
    );
  }

  async function confirm() {
    setSaving(true);
    const values: Record<string, unknown> = {};
    for (const row of rows) {
      const choice = choiceOf(row.field, row.defaultChoice);
      if (choice === 'other') values[row.field] = row.other;
      if (choice === 'both') values[row.field] = `${row.primary ?? ''}\n\n${row.other ?? ''}`.trim();
    }
    try {
      await api(`/leads/${id}/merge`, {
        method: 'POST',
        body: { duplicate_ids: otherId ? [otherId] : [], values },
      });
      try {
        sessionStorage.removeItem(MERGE_DRAFT_KEY);
      } catch {
        // sem armazenamento: nada a limpar
      }
      invalidate(id);
      toast.success(otherId ? 'Leads juntados.' : 'Dados juntados ao lead existente.');
      router.push(`/leads/${id}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  const otherTitle = otherId && other.data ? `#${other.data.number} ${other.data.company_name}` : 'Novo registo (não gravado)';

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="O que acontece"
          description={
            otherId
              ? `Os valores escolhidos ficam no lead #${primary.data.number}. A linha do tempo de ${otherTitle} passa para este lead e ${otherTitle} é apagado.`
              : `Os valores escolhidos são gravados no lead #${primary.data.number}. Não é criado nenhum lead novo.`
          }
        />
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">Os dois registos não têm valores diferentes — basta confirmar.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {rows.map((row) => {
              const choice = choiceOf(row.field, row.defaultChoice);
              const options: { value: Choice; label: string; text: string }[] = [
                { value: 'primary', label: `Manter #${primary.data!.number}`, text: display(row.field, row.primary, sectors) },
                { value: 'other', label: otherId ? `Usar ${otherTitle}` : 'Usar o novo valor', text: display(row.field, row.other, sectors) },
              ];
              if (CONCATENABLE.includes(row.field) && !blank(row.primary)) {
                options.push({ value: 'both', label: 'Manter os dois', text: 'Junta os dois textos' });
              }
              return (
                <fieldset key={row.field} className="grid gap-2 p-4 md:grid-cols-[12rem_1fr]">
                  <legend className="contents">
                    <span className="text-sm font-semibold">{LEAD_FIELD_LABELS[row.field]}</span>
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {options.map((o) => (
                      <label
                        key={o.value}
                        className={cn(
                          'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors',
                          choice === o.value ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
                        )}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <input
                            type="radio"
                            name={row.field}
                            value={o.value}
                            checked={choice === o.value}
                            onChange={() => setChoices((c) => ({ ...c, [row.field]: o.value }))}
                            className="accent-[var(--accent)]"
                          />
                          {o.label}
                        </span>
                        <span className="line-clamp-4 break-words whitespace-pre-line text-muted">{o.text}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={`/leads/${id}`} className={buttonClasses('ghost')}>
          Cancelar
        </Link>
        <Button onClick={confirm} loading={saving}>
          <GitMerge className="h-4 w-4" aria-hidden />
          Confirmar junção
        </Button>
      </div>
    </div>
  );
}

