/**
 * Passar uma gravação a texto (reuniões): usa um fornecedor OpenAI (ou compatível)
 * das Definições → Inteligência artificial — o da função "Email com IA", se for
 * desse tipo, senão o primeiro OpenAI. A Anthropic e o OpenRouter não transcrevem áudio.
 */
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { getSettings } from '../services/workspace';
import { listAiProviders, resolveAiProvider } from './providers';

export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;
const MODEL = () => process.env.AI_TRANSCRIBE_MODEL?.trim() || 'whisper-1';

export async function transcribeAudio(ctx: ApiContext, file: File): Promise<{ text: string; provider: string }> {
  if (file.size > TRANSCRIBE_MAX_BYTES) throw new ApiError(413, 'Gravação demasiado grande', 'O máximo são 25 MB (cerca de 1 hora e meia de áudio comprimido).');
  if (!file.size) throw new ApiError(422, 'Gravação vazia');
  const [settings, providers] = await Promise.all([getSettings(ctx), listAiProviders(ctx)]);
  const usable = (kind: string) => kind === 'openai' || kind === 'custom';
  const chosen = providers.find((p) => p.id === settings.ai.email.provider && usable(p.kind)) ?? providers.find((p) => p.kind === 'openai');
  if (!chosen) {
    throw new ApiError(
      422,
      'Sem fornecedor para transcrever',
      'Para passar a gravação a texto, junta uma chave da OpenAI em Definições → Inteligência artificial (a Anthropic não transcreve áudio). Entretanto, podes usar "Ditar" ou colar os apontamentos.',
    );
  }
  const provider = await resolveAiProvider(ctx, chosen.id);
  const body = new FormData();
  body.append('file', file, file.name || 'reuniao.webm');
  body.append('model', MODEL());
  body.append('language', 'pt');
  body.append('response_format', 'text');
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    body,
    signal: AbortSignal.timeout(170_000),
  }).catch((e: unknown) => {
    throw new ApiError(502, 'Sem resposta do fornecedor de IA', e instanceof Error ? e.message : undefined);
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? detail;
    } catch {
      // texto simples
    }
    throw new ApiError(502, `“${provider.label}” não transcreveu a gravação`, detail || `Erro ${res.status}.`);
  }
  if (!text) throw new ApiError(422, 'Não se ouviu nada', 'A gravação parece estar vazia ou em silêncio.');
  return { text: text.slice(0, 60_000), provider: provider.label };
}
