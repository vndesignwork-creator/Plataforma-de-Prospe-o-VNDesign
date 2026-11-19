/**
 * Versão B de um modelo, escrita pela IA: muda só o que se pediu (assunto,
 * começo, pedido final, tamanho ou foco) e mantém o resto igual — é assim que
 * um teste A/B diz alguma coisa.
 */
import {
  AB_SYSTEM_PROMPT,
  AbVariantDraftSchema,
  aiFunctionSetting,
  buildAbPrompt,
  type AbVariant,
  type AbVariantRequest,
} from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { hasAiProvider, resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { getSettings } from './workspace';

export async function writeAbVariant(ctx: ApiContext, input: AbVariantRequest): Promise<AbVariant> {
  if (!(await hasAiProvider(ctx))) {
    throw new ApiError(409, 'Sem IA configurada', 'Liga uma IA em Definições → Inteligência artificial para escrever a versão B.');
  }
  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, aiFunctionSetting(settings.ai, 'ab_test'), { anthropicModel: aiModel() });
  const { data, model: usedModel } = await generateJson(provider, model, {
    system: AB_SYSTEM_PROMPT,
    prompt: buildAbPrompt(input),
    schema: AbVariantDraftSchema,
    schemaName: 'versao_b',
  });
  if (!data.body.trim()) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');
  return {
    // Sem assunto novo (ou num modelo sem assunto), fica o da versão A.
    subject: data.subject.trim() || input.subject,
    body: data.body.trim(),
    changed: data.changed.replace(/\s+/g, ' ').trim(),
    model: usedModel,
  };
}
