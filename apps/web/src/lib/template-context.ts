'use client';

import { buildTemplateContext, todayIso, type Lead, type TemplateContext } from '@vndesign/core';
import { useSectors, useSettings, useSignature } from './queries';

/** Contexto das variáveis ({{empresa}}, {{assinatura}}…) para pré-visualizar no browser. */
export function useTemplateContext(lead: Lead | null | undefined): TemplateContext {
  const { data: signature } = useSignature();
  const { data: settings } = useSettings();
  const { data: sectors } = useSectors(true);
  const sectorArguments = lead?.sector_id ? (sectors?.find((s) => s.id === lead.sector_id)?.sales_arguments ?? null) : null;
  return buildTemplateContext({
    lead,
    signature,
    sectorArguments,
    optOutLine: settings?.opt_out_line ?? null,
    today: todayIso(),
  });
}

/** Tipos de modelo que são emails (têm assunto e podem abrir no cliente de email). */
export const EMAIL_KINDS = new Set(['cold_email', 'follow_up', 'general_email']);
