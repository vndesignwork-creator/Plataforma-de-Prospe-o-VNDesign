/**
 * Cartão de visita → dados do lead: a IA lê a fotografia (Claude ou um modelo
 * da OpenAI/OpenRouter que veja imagens). Só preenche o formulário; nada é gravado.
 */
import { CARD_SCAN_SYSTEM_PROMPT, CardScanDraftSchema, cardScanResult, type CardScanResult } from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { getSettings } from './workspace';

export async function scanBusinessCard(ctx: ApiContext, image: string): Promise<CardScanResult> {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image);
  if (!match) throw new ApiError(400, 'Formato de imagem inválido');
  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.email, { anthropicModel: aiModel() });
  const { data, model: used } = await generateJson(provider, model, {
    system: CARD_SCAN_SYSTEM_PROMPT,
    prompt: 'Lê este cartão de visita e devolve os dados.',
    schema: CardScanDraftSchema,
    schemaName: 'cartao_visita',
    image: { mediaType: match[1] as 'image/jpeg' | 'image/png' | 'image/webp', base64: match[2]! },
  });
  const result = cardScanResult(data, used);
  if (!result.company_name && !result.contact_name && !result.email && !result.phone) {
    throw new ApiError(422, 'Não foi possível ler o cartão', 'Tira outra fotografia, com mais luz e o cartão a ocupar a imagem toda.');
  }
  return result;
}
