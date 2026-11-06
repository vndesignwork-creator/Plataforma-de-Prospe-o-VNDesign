'use client';

/**
 * Definições → Campos personalizados: packs prontos a usar. Não estão ativos: só
 * entram nos leads quando se carrega em "Juntar" (os campos que já existem, pelo
 * nome, não se repetem).
 */
import { CUSTOM_FIELD_TYPE_LABELS, type CustomFieldType } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Check, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCustomFields } from '@/components/leads/custom-fields';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';

type PackField = { label: string; type: CustomFieldType; options?: string[] };
type Pack = { id: string; name: string; hint: string; fields: PackField[] };

export const CUSTOM_FIELD_PACKS: Pack[] = [
  {
    id: 'presenca',
    name: 'Presença online',
    hint: 'O ponto de partida para propor um site, redes sociais ou GEO.',
    fields: [
      { label: 'Plataforma do site', type: 'choice', options: ['Sem site', 'WordPress', 'Wix', 'Shopify', 'Squarespace', 'Feito à medida', 'Outra'] },
      { label: 'Tem Instagram?', type: 'yes_no' },
      { label: 'Seguidores no Instagram', type: 'number' },
      { label: 'Tem Facebook?', type: 'yes_no' },
      { label: 'Avaliação no Google', type: 'number' },
    ],
  },
  {
    id: 'negocio',
    name: 'Negócio e decisão',
    hint: 'Quem decide, o tamanho e o orçamento: para preparar a proposta.',
    fields: [
      { label: 'Quem decide', type: 'text' },
      { label: 'Nº de funcionários', type: 'number' },
      { label: 'Orçamento disponível', type: 'choice', options: ['Até 500 €', '500 € a 1500 €', '1500 € a 3000 €', 'Mais de 3000 €', 'Não sabe'] },
      { label: 'Melhor hora para ligar', type: 'text' },
    ],
  },
  {
    id: 'restauracao',
    name: 'Restauração',
    hint: 'Restaurantes, cafés e pastelarias.',
    fields: [
      { label: 'Faz reservas online?', type: 'yes_no' },
      { label: 'Tem o menu no site?', type: 'yes_no' },
      { label: 'Lugares sentados', type: 'number' },
      { label: 'Entregas', type: 'choice', options: ['Não faz', 'Uber Eats', 'Glovo', 'Bolt Food', 'Própria', 'Várias'] },
    ],
  },
  {
    id: 'comercio',
    name: 'Comércio e lojas',
    hint: 'Lojas de rua e pequenas marcas.',
    fields: [
      { label: 'Vende online?', type: 'yes_no' },
      { label: 'Nº de lojas', type: 'number' },
      { label: 'Programa de faturação', type: 'choice', options: ['Moloni', 'InvoiceXpress', 'Vendus', 'Primavera', 'PHC', 'Outro'] },
    ],
  },
  {
    id: 'saude',
    name: 'Saúde e bem-estar',
    hint: 'Clínicas, consultórios, ginásios e estética.',
    fields: [
      { label: 'Marcações online?', type: 'yes_no' },
      { label: 'Nº de profissionais', type: 'number' },
      { label: 'Especialidade', type: 'text' },
    ],
  },
  {
    id: 'imobiliaria',
    name: 'Imobiliária',
    hint: 'Agências e mediadores.',
    fields: [
      { label: 'Imóveis em carteira', type: 'number' },
      { label: 'Usa portais (Idealista e outros)?', type: 'yes_no' },
      { label: 'Tem os imóveis no próprio site?', type: 'yes_no' },
    ],
  },
  {
    id: 'design',
    name: 'Design e vídeo',
    hint: 'Para quem procura logótipo, imagem, motion ou vídeos.',
    fields: [
      { label: 'Tem logótipo?', type: 'yes_no' },
      { label: 'Tem manual de marca?', type: 'yes_no' },
      { label: 'Faz vídeos para as redes?', type: 'yes_no' },
      { label: 'Formato preferido', type: 'choice', options: ['Reels / TikTok', 'YouTube', 'Anúncios', 'Apresentação', 'Outro'] },
    ],
  },
];

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function CustomFieldPacks() {
  const { data: fields } = useCustomFields();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const existing = new Set((fields ?? []).map((f) => fold(f.label)));

  async function add(pack: Pack) {
    const missing = pack.fields.filter((f) => !existing.has(fold(f.label)));
    if (!missing.length) return;
    setBusy(pack.id);
    try {
      // Um de cada vez: ficam pela ordem do pack.
      for (const f of missing) await api('/custom-fields', { method: 'POST', body: { label: f.label, type: f.type, options: f.options ?? [] } });
      toast.success(`Pack “${pack.name}” juntado: ${missing.length} campo${missing.length === 1 ? '' : 's'} novo${missing.length === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
      for (const key of ['custom-fields', 'leads', 'lead']) void qc.invalidateQueries({ queryKey: [key] });
    }
  }

  return (
    <Card>
      <CardHeader title="Packs prontos" description="Ainda não estão ativos: só entram nos leads quando carregas em “Juntar”. Os campos que já tens não se repetem." />
      <ul aria-label="Packs de campos" className="divide-y divide-border">
        {CUSTOM_FIELD_PACKS.map((pack) => {
          const missing = pack.fields.filter((f) => !existing.has(fold(f.label))).length;
          return (
            <li key={pack.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="font-medium">{pack.name}</p>
                  <p className="text-sm text-muted">{pack.hint}</p>
                </div>
                {missing ? (
                  <Button size="sm" variant="outline" className="ml-auto" loading={busy === pack.id} disabled={!!busy} onClick={() => void add(pack)}>
                    <PackagePlus className="h-3.5 w-3.5" aria-hidden /> Juntar{missing < pack.fields.length ? ` (${missing})` : ''}
                  </Button>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-1 text-sm text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden /> Já juntado
                  </span>
                )}
              </div>
              <ul aria-label={`Campos do pack ${pack.name}`} className="flex flex-wrap gap-1.5">
                {pack.fields.map((f) => (
                  <li
                    key={f.label}
                    title={f.options?.length ? `${CUSTOM_FIELD_TYPE_LABELS[f.type]}: ${f.options.join(', ')}` : CUSTOM_FIELD_TYPE_LABELS[f.type]}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted"
                  >
                    {existing.has(fold(f.label)) ? <Check className="mr-1 inline h-3 w-3 text-success" aria-label="já existe" /> : null}
                    {f.label}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
