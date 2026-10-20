/**
 * Fornecedores de IA do workspace (Definições → Inteligência artificial):
 * a chave da Anthropic do servidor (ANTHROPIC_API_KEY) e as chaves guardadas
 * (cifradas) para Anthropic, OpenAI, OpenRouter ou outro serviço compatível.
 */
import net from 'node:net';
import {
  AI_PROVIDER_META,
  SERVER_AI_PROVIDER,
  type AiFeatureSetting,
  type AiProvider,
  type AiProviderCreate,
  type AiProviderKind,
  type AiProviderTestResult,
  type AiProviderUpdate,
} from '@vndesign/core';
import { isPrivateAddress } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { aiApiKey, aiKeyHint } from './claude';
import { keyHint, openSecret, sealSecret } from './secret-box';

export interface ResolvedProvider {
  id: string;
  kind: AiProviderKind;
  label: string;
  apiKey: string;
  /** Endereço base da API (OpenAI e compatíveis: termina em /v1). */
  baseUrl: string;
}

type Row = {
  id: string;
  kind: AiProviderKind;
  label: string;
  base_url: string | null;
  api_key_ciphertext: string;
  key_hint: string;
  created_at: string;
};
const SELECT = 'id, kind, label, base_url, api_key_ciphertext, key_hint, created_at';

const SERVER_LABEL = 'Claude (chave do servidor)';

function adminOnly(ctx: ApiContext) {
  if (ctx.role === 'member') throw new ApiError(403, 'Sem permissão', 'Só o dono ou um administrador pode gerir as chaves de IA.');
}

/** Nos testes (AI_BASE_URL), todos os fornecedores falam com o servidor falso. */
function baseUrlFor(kind: AiProviderKind, custom: string | null): string {
  const test = process.env.AI_BASE_URL;
  if (kind === 'anthropic') return test || AI_PROVIDER_META.anthropic.baseUrl!;
  if (kind === 'custom') return custom ?? '';
  return test ? `${test}/v1` : AI_PROVIDER_META[kind].baseUrl!;
}

/** Endereço próprio (fornecedor "Outro"): em produção só https e nunca endereços internos. */
function assertPublicBaseUrl(value: string) {
  if (process.env.NODE_ENV !== 'production' || process.env.AI_ALLOW_PRIVATE_BASE_URL === '1') return;
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (net.isIP(host) && isPrivateAddress(host))
  ) {
    throw new ApiError(422, 'Endereço não permitido', 'Usa o endereço público da API (https://…).', {
      errors: { base_url: ['Usa o endereço público da API (https://…).'] },
    });
  }
}

function toProvider(row: Row): AiProvider {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    base_url: row.kind === 'custom' ? row.base_url : null,
    key_hint: row.key_hint,
    web_search: AI_PROVIDER_META[row.kind].webSearch,
    built_in: false,
    created_at: row.created_at,
  };
}

function serverProvider(): AiProvider | null {
  const hint = aiKeyHint();
  if (!aiApiKey() || !hint) return null;
  return {
    id: SERVER_AI_PROVIDER,
    kind: 'anthropic',
    label: SERVER_LABEL,
    base_url: null,
    key_hint: `…${(aiApiKey() ?? '').slice(-4)}`,
    web_search: true,
    built_in: true,
    created_at: null,
  };
}

async function rows(ctx: ApiContext): Promise<Row[]> {
  const { data, error } = await ctx.supabase
    .from('ai_providers')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at');
  // Antes da migração 20261025000100 a tabela não existe: só a chave do servidor.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
  if (error) throw fromPostgrest(error);
  return (data ?? []) as Row[];
}

export async function listAiProviders(ctx: ApiContext): Promise<AiProvider[]> {
  const server = serverProvider();
  return [...(server ? [server] : []), ...(await rows(ctx)).map(toProvider)];
}

async function getRow(ctx: ApiContext, id: string): Promise<Row> {
  const { data, error } = await ctx.supabase
    .from('ai_providers')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw fromPostgrest(error, 'Fornecedor não encontrado');
  if (!data) throw new ApiError(404, 'Fornecedor não encontrado');
  return data as Row;
}

const labelTaken = (error: { code?: string }) =>
  error.code === '23505' ? new ApiError(409, 'Nome repetido', 'Já existe um fornecedor com esse nome.') : null;

export async function createAiProvider(ctx: ApiContext, input: AiProviderCreate): Promise<AiProvider> {
  adminOnly(ctx);
  if (input.kind === 'custom' && input.base_url) assertPublicBaseUrl(input.base_url);
  const existing = await rows(ctx);
  let label = input.label ?? AI_PROVIDER_META[input.kind].label;
  // Nome por omissão repetido (ex.: duas chaves da OpenAI): "OpenAI (ChatGPT) 2".
  if (!input.label) {
    const taken = new Set(existing.map((r) => r.label.toLowerCase()));
    for (let n = 2; taken.has(label.toLowerCase()); n++) label = `${AI_PROVIDER_META[input.kind].label} ${n}`;
  }
  const { data, error } = await ctx.supabase
    .from('ai_providers')
    .insert({
      workspace_id: ctx.workspaceId,
      kind: input.kind,
      label,
      base_url: input.kind === 'custom' ? input.base_url : null,
      api_key_ciphertext: sealSecret(input.api_key),
      key_hint: keyHint(input.api_key),
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  if (error) throw labelTaken(error) ?? fromPostgrest(error);
  return toProvider(data as Row);
}

export async function updateAiProvider(ctx: ApiContext, id: string, input: AiProviderUpdate): Promise<AiProvider> {
  adminOnly(ctx);
  const row = await getRow(ctx, id);
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.api_key) {
    patch.api_key_ciphertext = sealSecret(input.api_key);
    patch.key_hint = keyHint(input.api_key);
  }
  if (input.base_url !== undefined && row.kind === 'custom') {
    if (!input.base_url) throw new ApiError(422, 'Falta o endereço', 'Indica o endereço da API.');
    assertPublicBaseUrl(input.base_url);
    patch.base_url = input.base_url;
  }
  if (!Object.keys(patch).length) return toProvider(row);
  const { data, error } = await ctx.supabase
    .from('ai_providers')
    .update(patch)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw labelTaken(error) ?? fromPostgrest(error);
  return toProvider(data as Row);
}

export async function deleteAiProvider(ctx: ApiContext, id: string): Promise<void> {
  adminOnly(ctx);
  await getRow(ctx, id);
  const { error } = await ctx.supabase.from('ai_providers').delete().eq('workspace_id', ctx.workspaceId).eq('id', id);
  if (error) throw fromPostgrest(error);
  // As funções que o usavam voltam à chave do servidor.
  const { data } = await ctx.supabase.from('workspaces').select('settings').eq('id', ctx.workspaceId).maybeSingle();
  const settings = (data?.settings ?? {}) as { ai?: Record<string, { provider?: string; model?: string | null }> };
  let changed = false;
  for (const feature of Object.values(settings.ai ?? {})) {
    if (feature?.provider === id) {
      feature.provider = SERVER_AI_PROVIDER;
      feature.model = null;
      changed = true;
    }
  }
  if (changed) await ctx.supabase.from('workspaces').update({ settings }).eq('id', ctx.workspaceId);
}

/** A chave e o endereço para usar agora (só no servidor). */
export async function resolveAiProvider(ctx: ApiContext, id: string): Promise<ResolvedProvider> {
  if (id === SERVER_AI_PROVIDER) {
    const key = aiApiKey();
    if (!key) {
      throw new ApiError(
        503,
        'IA não configurada',
        'Junta uma chave em Definições → Inteligência artificial (ou define ANTHROPIC_API_KEY no servidor).',
      );
    }
    return { id, kind: 'anthropic', label: SERVER_LABEL, apiKey: key, baseUrl: baseUrlFor('anthropic', null) };
  }
  let row: Row;
  try {
    row = await getRow(ctx, id);
  } catch {
    throw new ApiError(503, 'Fornecedor de IA não encontrado', 'Escolhe outro em Definições → Inteligência artificial.');
  }
  const key = openSecret(row.api_key_ciphertext);
  if (!key) {
    throw new ApiError(
      503,
      'Chave de IA ilegível',
      `Não foi possível abrir a chave de “${row.label}” (a chave de cifra do servidor mudou?). Cola-a outra vez em Definições → Inteligência artificial.`,
    );
  }
  return { id: row.id, kind: row.kind, label: row.label, apiKey: key, baseUrl: baseUrlFor(row.kind, row.base_url) };
}

/** Fornecedor e modelo escolhidos para uma função, já resolvidos. */
export async function resolveAiFeature(
  ctx: ApiContext,
  setting: AiFeatureSetting,
  defaults: { anthropicModel: string },
): Promise<{ provider: ResolvedProvider; model: string }> {
  const provider = await resolveAiProvider(ctx, setting.provider);
  const model = setting.model?.trim() || (provider.kind === 'anthropic' ? defaults.anthropicModel : null);
  if (!model) {
    throw new ApiError(422, 'Falta escolher o modelo', `Escolhe o modelo de “${provider.label}” em Definições → Inteligência artificial.`);
  }
  return { provider, model };
}

/** Confirma a chave pedindo a lista de modelos ao fornecedor. */
export async function testAiProvider(ctx: ApiContext, id: string): Promise<AiProviderTestResult> {
  const provider = await resolveAiProvider(ctx, id);
  const anthropic = provider.kind === 'anthropic';
  const url = anthropic ? `${provider.baseUrl.replace(/\/+$/, '')}/v1/models?limit=100` : `${provider.baseUrl}/models`;
  const headers: Record<string, string> = anthropic
    ? { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${provider.apiKey}` };
  try {
    // No OpenRouter a lista de modelos é pública: a chave confirma-se à parte.
    if (provider.kind === 'openrouter') {
      const check = await fetch(`${provider.baseUrl}/key`, { headers, signal: AbortSignal.timeout(20_000) });
      if (check.status === 401 || check.status === 403) {
        return { ok: false, message: 'O fornecedor recusou a chave (inválida, apagada ou sem permissão).', models: [] };
      }
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'O fornecedor recusou a chave (inválida, apagada ou sem permissão).', models: [] };
    }
    if (!res.ok) return { ok: false, message: `O fornecedor respondeu ${res.status}.`, models: [] };
    const body = (await res.json()) as { data?: { id?: string }[] };
    const models = (body.data ?? [])
      .map((m) => m.id)
      .filter((m): m is string => typeof m === 'string')
      .sort((a, b) => a.localeCompare(b));
    return { ok: true, message: models.length ? `Chave válida · ${models.length} modelos disponíveis.` : 'Chave válida.', models };
  } catch (error) {
    return {
      ok: false,
      message: `Não foi possível contactar o fornecedor (${error instanceof Error ? error.message : 'erro de rede'}).`,
      models: [],
    };
  }
}

/** Há alguma IA disponível (chave do servidor ou uma das Definições)? */
export async function hasAiProvider(ctx: ApiContext): Promise<boolean> {
  return (await listAiProviders(ctx)).length > 0;
}

/** Confirma que o fornecedor escolhido para uma função existe. */
export async function assertAiProviderExists(ctx: ApiContext, id: string): Promise<void> {
  if (id === SERVER_AI_PROVIDER) return;
  const exists = (await rows(ctx)).some((r) => r.id === id);
  if (!exists) throw new ApiError(422, 'Fornecedor de IA não encontrado', 'Escolhe um dos fornecedores da lista.');
}
