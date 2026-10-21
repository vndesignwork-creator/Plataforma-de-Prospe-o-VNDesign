'use client';

/** Campos da pesquisa do gerador (usados na pesquisa normal e nas automáticas). */
import { LEAD_GENERATION_LIMITS } from '@vndesign/core';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { MultiSelectFilter } from '@/components/leads/multi-select';
import { ServiceGlyph, useServiceCatalog } from '@/components/services/services';
import { useSectors } from '@/lib/queries';

export const COUNTS = [10, 15, 20, 30].filter((n) => n <= LEAD_GENERATION_LIMITS.maxResults);

export interface SearchDraft {
  query: string;
  city: string;
  sectorId: string;
  services: string[];
  count: number;
}

export const EMPTY_DRAFT: SearchDraft = { query: '', city: 'Amadora', sectorId: '', services: [], count: 15 };

/** O rascunho no formato da API. */
export const draftToRequest = (d: SearchDraft) => ({
  query: d.query.trim(),
  city: d.city.trim() || null,
  sector_id: d.sectorId || null,
  services: d.services,
  max_results: d.count,
});

export function SearchFields({
  value,
  onChange,
  error,
}: {
  value: SearchDraft;
  onChange: (next: SearchDraft) => void;
  error?: string;
}) {
  const { data: sectors } = useSectors();
  const catalog = useServiceCatalog();
  const set = (patch: Partial<SearchDraft>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field
        label="O que procuras?"
        required
        error={error}
        className="md:col-span-2"
        hint="Ex.: “restaurantes sem site ou com site antigo”, “clínicas dentárias com má imagem nas redes sociais”."
      >
        <Textarea rows={2} value={value.query} maxLength={500} onChange={(e) => set({ query: e.target.value })} />
      </Field>
      <Field label="Zona" hint="Cidade ou concelho. Vazio = Portugal.">
        <Input value={value.city} maxLength={120} onChange={(e) => set({ city: e.target.value })} />
      </Field>
      <Field label="Setor (opcional)">
        <Select value={value.sectorId} onChange={(e) => set({ sectorId: e.target.value })}>
          <option value="">Qualquer setor</option>
          {(sectors ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Serviços a propor</span>
        <MultiSelectFilter
          label={value.services.length ? 'Serviços' : 'Todos os serviços'}
          value={value.services}
          onChange={(services) => set({ services })}
          className="w-full"
          options={catalog.active.map((s) => ({
            value: s.key,
            label: `${s.label} · ${catalog.categoryLabel(s.category)}`,
            icon: <ServiceGlyph icon={s.icon} className="text-muted" />,
          }))}
        />
      </div>
      <Field label="Quantas empresas (no máximo)">
        <Select value={String(value.count)} onChange={(e) => set({ count: Number(e.target.value) })}>
          {COUNTS.map((n) => (
            <option key={n} value={n}>
              Até {n}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
