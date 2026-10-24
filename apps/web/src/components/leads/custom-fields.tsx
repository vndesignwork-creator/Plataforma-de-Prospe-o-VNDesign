'use client';

/**
 * Campos personalizados na ficha (cada um edita-se no sítio e grava ao sair do
 * campo) e as opções do filtro na lista de leads (escolhas e sim/não).
 * Os campos criam-se em Definições → Campos personalizados.
 */
import { formatCustomValue, type CustomField, type Lead } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { ListPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import { useUpdateLead } from '@/lib/queries';

export function useCustomFields() {
  return useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api<{ data: CustomField[] }>('/custom-fields').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

/** Filtros da lista: um por campo de escolha ou sim/não (valor "chave:valor" no endereço). */
export function customFilterOptions(field: CustomField): { value: string; label: string }[] {
  if (field.type === 'yes_no') {
    return [
      { value: 'true', label: 'Sim' },
      { value: 'false', label: 'Não' },
    ];
  }
  return field.options.map((o) => ({ value: o, label: o }));
}

/** Linhas da ficha (uma por campo). Sem campos criados: não mostra nada. */
export function CustomFieldsRows({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const { data: fields } = useCustomFields();
  if (!fields?.length) return null;
  return (
    <>
      {fields.map((f) => (
        // As mesmas linhas das outras da ficha (Row).
        <div key={f.id} className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 py-1.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="text-muted">{f.label}</dt>
          <dd className="min-w-0 break-words">
            {canEdit ? <CustomFieldInput lead={lead} field={f} /> : formatCustomValue(f, lead.custom?.[f.key]) || <span className="text-muted">—</span>}
          </dd>
        </div>
      ))}
    </>
  );
}

function CustomFieldInput({ lead, field }: { lead: Lead; field: CustomField }) {
  const update = useUpdateLead(lead.id);
  const stored = lead.custom?.[field.key];
  const shown = stored === undefined || stored === null ? '' : field.type === 'yes_no' ? (stored ? 'true' : 'false') : String(stored);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? shown;

  async function save(next: string) {
    setDraft(null);
    if (next === shown) return;
    const custom = { ...(lead.custom ?? {}) };
    if (next === '') delete custom[field.key];
    else custom[field.key] = field.type === 'yes_no' ? next === 'true' : field.type === 'number' ? Number(next.replace(',', '.')) : next;
    try {
      await update.mutateAsync({ custom });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (field.type === 'yes_no' || field.type === 'choice') {
    return (
      <Select value={value} onChange={(e) => void save(e.target.value)} aria-label={field.label} className="h-8 max-w-xs">
        <option value="">—</option>
        {customFilterOptions(field).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <Input
      value={value}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      maxLength={500}
      onChange={(e) => setDraft(field.type === 'number' ? e.target.value.replace(/[^\d.,-]/g, '') : e.target.value)}
      onBlur={() => draft !== null && void save(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      placeholder="—"
      aria-label={field.label}
      className="h-8 max-w-xs"
    />
  );
}

/** Ligação às Definições quando ainda não há campos (só para o dono/administrador). */
export function CustomFieldsHint() {
  return (
    <Link href="/definicoes/campos" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg hover:underline">
      <ListPlus className="h-3.5 w-3.5" aria-hidden /> Campos personalizados
    </Link>
  );
}
