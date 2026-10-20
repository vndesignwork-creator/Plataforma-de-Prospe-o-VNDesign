/**
 * Fornecedores de IA: além da chave da Anthropic definida no servidor, cada
 * workspace pode juntar chaves da Anthropic, OpenAI (ChatGPT), OpenRouter ou de
 * outro serviço compatível com a API da OpenAI (Groq, Mistral, DeepSeek…).
 * Em Definições → Inteligência artificial escolhe-se o fornecedor e o modelo
 * do email com IA e do gerador de leads.
 */
import { z } from 'zod';

export const AI_PROVIDER_KINDS = ['anthropic', 'openai', 'openrouter', 'custom'] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

/** A chave da Anthropic definida no servidor (ANTHROPIC_API_KEY). */
export const SERVER_AI_PROVIDER = 'server';

export const AI_PROVIDER_META: Record<
  AiProviderKind,
  { label: string; baseUrl: string | null; webSearch: boolean; keyHelp: string; modelExample: string }
> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    webSearch: true,
    keyHelp: 'console.anthropic.com → API Keys (começa por sk-ant-)',
    modelExample: 'claude-sonnet-5-5',
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    baseUrl: 'https://api.openai.com/v1',
    webSearch: true,
    keyHelp: 'platform.openai.com → API keys (começa por sk-)',
    modelExample: 'gpt-5-mini',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    webSearch: true,
    keyHelp: 'openrouter.ai → Keys (começa por sk-or-)',
    modelExample: 'openai/gpt-5-mini',
  },
  custom: {
    label: 'Outro (compatível com OpenAI)',
    baseUrl: null,
    webSearch: false,
    keyHelp: 'A chave do serviço (Groq, Mistral, DeepSeek…) e o endereço da API dele.',
    modelExample: 'nome-do-modelo',
  },
};

/** O que a API devolve (nunca a chave, só os últimos carateres). */
export const AiProviderSchema = z
  .object({
    id: z.string().meta({ description: 'ID do fornecedor ("server" = chave da Anthropic definida no servidor)' }),
    kind: z.enum(AI_PROVIDER_KINDS),
    label: z.string(),
    base_url: z.string().nullable(),
    key_hint: z.string().meta({ description: 'Últimos carateres da chave' }),
    web_search: z.boolean().meta({ description: 'Pode pesquisar na internet (gerador de leads)' }),
    built_in: z.boolean().meta({ description: 'Definido no servidor (não se edita aqui)' }),
    created_at: z.string().nullable(),
  })
  .meta({ id: 'AiProvider' });
export type AiProvider = z.infer<typeof AiProviderSchema>;

const apiKeyField = z
  .string()
  .trim()
  .min(10, { error: 'A chave parece incompleta.' })
  .max(400, { error: 'Chave demasiado longa.' })
  .refine((v) => /^[\x21-\x7E]+$/.test(v), { error: 'A chave tem espaços ou carateres inválidos.' });

const baseUrlField = z
  .string()
  .trim()
  .max(300)
  .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), { error: 'Indica o endereço completo (https://…).' })
  .transform((v) => v.replace(/\/+$/, ''));

const labelField = z.string().trim().min(1, { error: 'Indica um nome.' }).max(60, { error: 'Máximo de 60 caracteres.' });

export const AiProviderCreateSchema = z
  .object({
    kind: z.enum(AI_PROVIDER_KINDS, { error: 'Escolhe o fornecedor.' }),
    label: labelField.optional(),
    api_key: apiKeyField,
    base_url: baseUrlField.nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.kind !== 'custom' || !!v.base_url, { error: 'Indica o endereço da API.', path: ['base_url'] })
  .meta({ id: 'AiProviderCreate' });
export type AiProviderCreate = z.output<typeof AiProviderCreateSchema>;

export const AiProviderUpdateSchema = z
  .object({
    label: labelField.optional(),
    api_key: apiKeyField.optional(),
    base_url: baseUrlField.nullish(),
  })
  .meta({ id: 'AiProviderUpdate' });
export type AiProviderUpdate = z.output<typeof AiProviderUpdateSchema>;

export const AiProviderTestResultSchema = z
  .object({ ok: z.boolean(), message: z.string(), models: z.array(z.string()) })
  .meta({ id: 'AiProviderTestResult' });
export type AiProviderTestResult = z.infer<typeof AiProviderTestResultSchema>;

/** Que fornecedor e modelo usa cada função (null = o modelo por omissão). */
export const AiFeatureSettingSchema = z.object({
  provider: z.string().default(SERVER_AI_PROVIDER),
  model: z.string().trim().max(120).nullable().default(null),
});
export type AiFeatureSetting = z.infer<typeof AiFeatureSettingSchema>;

export const AiSettingsSchema = z.object({
  email: AiFeatureSettingSchema.default({ provider: SERVER_AI_PROVIDER, model: null }),
  lead_generation: AiFeatureSettingSchema.default({ provider: SERVER_AI_PROVIDER, model: null }),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const AiSettingsUpdateSchema = z.object({
  email: z.object({ provider: z.string().min(1).max(60), model: z.string().trim().max(120).nullable() }).optional(),
  lead_generation: z.object({ provider: z.string().min(1).max(60), model: z.string().trim().max(120).nullable() }).optional(),
});

/**
 * JSON a partir do texto de um modelo que não suporta saída estruturada: aceita
 * o JSON sozinho, dentro de ```json … ``` ou com texto à volta.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1];
  for (const candidate of [trimmed, fenced]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // tenta a seguir
    }
  }
  const start = trimmed.search(/[[{]/);
  if (start >= 0) {
    const open = trimmed[start];
    const end = trimmed.lastIndexOf(open === '{' ? '}' : ']');
    if (end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // sem JSON válido
      }
    }
  }
  return null;
}
