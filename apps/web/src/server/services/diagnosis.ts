/**
 * Relatório de diagnóstico do site (PDF para o cliente), a partir da última
 * análise do site do lead. Pode desligar-se em Definições → Funcionalidades.
 */
import { slugify } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { renderDiagnosisPdf } from '../proposals/diagnosis-pdf';
import { listVisibilityChecks } from './ai-visibility';
import { latestScreenshots, listAudits } from './audits';
import { getLead } from './leads';
import { loadServiceCatalog } from './service-catalog';
import { getSettings, getSignature } from './workspace';

export async function diagnosisPdf(ctx: ApiContext, leadId: string): Promise<{ content: Buffer; filename: string }> {
  const [settings, lead, audits, signature, services] = await Promise.all([
    getSettings(ctx),
    getLead(ctx, leadId),
    listAudits(ctx, leadId),
    getSignature(ctx),
    loadServiceCatalog(ctx),
  ]);
  if (!settings.features.diagnosis_report) {
    throw new ApiError(422, 'Relatório desligado', 'Liga o relatório de diagnóstico em Definições → Funcionalidades.');
  }
  const audit = audits.find((a) => a.status === 'done');
  if (!audit) {
    throw new ApiError(422, 'Ainda não há análise do site', 'Analisa primeiro o site do lead (cartão “Diagnóstico do site” → Analisar).');
  }
  // As imagens do site entram se existirem (uma falha no Storage não impede o relatório).
  const shots = settings.features.site_screenshots ? await latestScreenshots(ctx, leadId).catch(() => []) : [];
  // O último teste "Aparece nas IAs?" concluído (opcional).
  const check = (await listVisibilityChecks(ctx, leadId).catch(() => [])).find((c) => c.status === 'done' && c.summary);
  const content = await renderDiagnosisPdf({
    screenshots: shots,
    visibility: check
      ? {
          summary: check.summary!,
          assistant: check.assistant,
          mentioned: check.mentioned_count,
          total: check.results.length,
          competitors: check.competitors.slice(0, 3).map((c) => c.name),
          date: check.created_at.slice(0, 10),
        }
      : null,
    audit,
    lead: {
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      city: lead.city,
      approach_angle: lead.approach_angle,
      services: lead.services ?? [],
    },
    services,
    signature,
  });
  return { content, filename: `Diagnostico-${slugify(lead.company_name) || 'site'}.pdf` };
}
