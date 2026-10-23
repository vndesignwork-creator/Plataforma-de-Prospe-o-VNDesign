'use client';

import { buildTemplateContext, todayIso, type Lead, type TemplateContext } from '@vndesign/core';
import { useServiceCatalog } from '@/components/services/services';
import { useAiVisibility, useSectors, useSettings, useSignature } from './queries';

/** Contexto das variáveis ({{empresa}}, {{assinatura}}…) para pré-visualizar no browser. */
export function useTemplateContext(
  lead: Lead | null | undefined,
  meeting?: { starts_at: string; location?: string | null } | null,
): TemplateContext {
  const { data: signature } = useSignature();
  const { data: settings } = useSettings();
  const { data: sectors } = useSectors(true);
  const catalog = useServiceCatalog();
  // {{visibilidade_ia}}: a frase do último teste "Aparece nas IAs?" deste lead.
  const { data: checks } = useAiVisibility(lead?.id ?? '', !!lead?.id);
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

/** Tipos de modelo que são emails (têm assunto e podem abrir no cliente de email). */
export const EMAIL_KINDS = new Set(['cold_email', 'follow_up', 'general_email']);
