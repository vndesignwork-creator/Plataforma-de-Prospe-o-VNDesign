'use client';

import { buildTemplateContext, todayIso, type Lead, type TemplateContext } from '@vndesign/core';
import { useServiceCatalog } from '@/components/services/services';
import { useAiVisibility, useSectors, useSettings, useSignature } from './queries';

/** Contexto das variáveis ({{empresa}}, {{assinatura}}…) para pré-visualizar no browser. */
export function useTemplateContext(
  lead: Lead | null | undefined,
  meeting?: { starts_at: string; location?: string | null } | null,
  /** false: o texto não usa {{visibilidade_ia}} (sem um pedido ao servidor por lead, ex.: listas da Prospeção). */
  options: { aiVisibility?: boolean } = {},
): TemplateContext {
  const { data: signature } = useSignature();
  const { data: settings } = useSettings();
  const { data: sectors } = useSectors(true);
  const catalog = useServiceCatalog();
  // {{visibilidade_ia}}: a frase do último teste "Aparece nas IAs?" deste lead.
  const { data: checks } = useAiVisibility(lead?.id ?? '', !!lead?.id && options.aiVisibility !== false);
  const sectorArguments = lead?.sector_id ? (sectors?.find((s) => s.id === lead.sector_id)?.sales_arguments ?? null) : null;
  return buildTemplateContext({
    lead,
    signature,
    sectorArguments,
    optOutLine: settings?.opt_out_line ?? null,
    today: todayIso(),
    services: catalog.all,
    categories: catalog.categories,
    meeting,
    reviewUrl: settings?.google_review_url ?? null,
    aiVisibility: checks?.find((c) => c.status === 'done')?.summary ?? null,
  });
}

/** O texto usa a variável {{visibilidade_ia}} (só então vale a pena ir buscar o teste "Aparece nas IAs?"). */
export const usesAiVisibility = (...texts: (string | null | undefined)[]) => texts.some((t) => t?.includes('visibilidade_ia'));

/** Tipos de modelo que são emails (têm assunto e podem abrir no cliente de email). */
export const EMAIL_KINDS = new Set(['cold_email', 'follow_up', 'general_email']);
