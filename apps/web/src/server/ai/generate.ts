/**
 * Pedidos de IA independentes do fornecedor:
 *  - generateJson: um texto estruturado (email com IA);
 *  - searchCompanies: pesquisa na internet com uma lista de empresas no fim (gerador de leads).
 * Anthropic usa o SDK oficial; OpenAI, OpenRouter e compatíveis usam a API REST
 * no formato da OpenAI. Se um fornecedor/modelo recusar uma opção (ex.: saída
 * estruturada), tenta-se a variante seguinte, mais simples.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { LEAD_GENERATION_LIMITS, LEAD_GENERATION_TOOL, LEAD_GENERATION_TOOL_NAME, extractJson } from '@vndesign/core';
import { z } from 'zod';
import { ApiError } from '../http';
import { anthropicClientFor, anthropicErrorMessage } from './claude';
import type { ResolvedProvider } from './providers';

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
  searches: number;
}

// -----------------------------------------------------------------------------
// Erros
// -----------------------------------------------------------------------------

function anthropicError(error: unknown, provider: ResolvedProvider): unknown {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ApiError(503, 'Chave da IA inválida', `A Anthropic recusou a chave de “${provider.label}”: ${anthropicErrorMessage(error)}`);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new ApiError(503, 'Chave sem permissão', `A Anthropic recusou o pedido: ${anthropicErrorMessage(error)}`);
  }
  if (error instanceof Anthropic.BadRequestError) {
    const message = anthropicErrorMessage(error);
    if (/credit balance/i.test(message)) {
      return new ApiError(402, 'Sem créditos na Anthropic', 'A conta não tem créditos. Compra créditos em console.anthropic.com → Billing.');
    }
    if (/web.?search|web.?fetch/i.test(message) && /not enabled|disabled/i.test(message)) {
      return new ApiError(
        503,
        'Pesquisa na internet desativada',
        'A pesquisa na internet está desligada na conta da Anthropic. Liga-a em platform.claude.com/settings/capabilities (web search e web fetch) e tenta outra vez.',
      );
    }
    return new ApiError(502, 'Erro da IA', `A Anthropic respondeu: ${message}`);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ApiError(422, 'Modelo não encontrado', `A Anthropic não conhece este modelo: ${anthropicErrorMessage(error)}`);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ApiError(429, 'Demasiados pedidos', 'O limite da IA foi atingido. Tenta outra vez dentro de um minuto.');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ApiError(504, 'A IA demorou demasiado', 'Tenta outra vez.');
  }
  if (error instanceof Anthropic.APIError) {
    console.error('[ia] erro da API', error.status, anthropicErrorMessage(error));
    return new ApiError(502, 'Erro da IA', `A Anthropic respondeu ${error.status ?? 'com um erro'}: ${anthropicErrorMessage(error)}`);
  }
  return error;
}

class HttpAiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function httpError(error: unknown, provider: ResolvedProvider): unknown {
  if (!(error instanceof HttpAiError)) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return new ApiError(504, 'A IA demorou demasiado', 'Tenta outra vez.');
    }
    if (error instanceof TypeError) {
      return new ApiError(502, 'Fornecedor de IA inacessível', `Não foi possível contactar “${provider.label}”.`);
    }
    return error;
  }
  const detail = error.message.slice(0, 300);
  if (error.status === 401 || error.status === 403) {
    return new ApiError(503, 'Chave da IA inválida', `“${provider.label}” recusou a chave: ${detail}`);
  }
  if (error.status === 402) return new ApiError(402, 'Sem créditos', `“${provider.label}”: a conta não tem créditos (${detail}).`);
  if (error.status === 404) return new ApiError(422, 'Modelo não encontrado', `“${provider.label}” não conhece este modelo: ${detail}`);
  if (error.status === 429) {
    return new ApiError(429, 'Limite atingido', `“${provider.label}”: demasiados pedidos ou quota esgotada (${detail}).`);
  }
  return new ApiError(502, 'Erro da IA', `“${provider.label}” respondeu ${error.status}: ${detail}`);
}

async function postJson(provider: ResolvedProvider, path: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  };
  if (provider.kind === 'openrouter') {
    headers['HTTP-Referer'] = process.env.APP_URL || 'https://leads.vndesign.pt';
    headers['X-Title'] = 'VNDesign Leads';
  }
  const res = await fetch(`${provider.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      message = (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ?? parsed.message ?? text;
    } catch {
      // texto simples
    }
    throw new HttpAiError(res.status, message || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** Tenta cada variante; passa à seguinte só quando o pedido é recusado como inválido (400/422). */
async function firstAccepted<T>(variants: (() => Promise<T>)[]): Promise<T> {
  let last: unknown;
  for (const variant of variants) {
    try {
      return await variant();
    } catch (error) {
      last = error;
      if (!(error instanceof HttpAiError) || (error.status !== 400 && error.status !== 422)) throw error;
    }
  }
  throw last;
}

/** Esquema JSON aceite pela saída estruturada da OpenAI (sem "$schema"). */
function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

function chatText(body: Record<string, unknown>): string {
  const choice = (body.choices as { message?: { content?: unknown } }[] | undefined)?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : ((c as { text?: string }).text ?? ''))).join('');
  return '';
}

function chatUsage(body: Record<string, unknown>): Pick<AiUsage, 'input_tokens' | 'output_tokens'> {
  const usage = (body.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
  return {
    input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
  };
}

// -----------------------------------------------------------------------------
// Texto estruturado (email com IA)
// -----------------------------------------------------------------------------

export async function generateJson<T>(
  provider: ResolvedProvider,
  model: string,
  input: { system: string; prompt: string; schema: z.ZodType<T>; schemaName: string },
): Promise<{ data: T; model: string }> {
  if (provider.kind === 'anthropic') {
    let response;
    try {
      response = await anthropicClientFor(provider.apiKey).beta.messages.parse({
        model,
        max_tokens: 16000,
        // Se o pedido for recusado pelos filtros de segurança, a API tenta outro modelo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium', format: betaZodOutputFormat(input.schema as z.ZodType<T> & z.ZodObject) },
        // As instruções fixas ficam em cache entre pedidos.
        system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: input.prompt }],
      });
    } catch (error) {
      throw anthropicError(error, provider);
    }
    if (response.stop_reason === 'refusal') {
      throw new ApiError(422, 'Pedido recusado pela IA', 'Reformula as indicações e tenta outra vez.');
    }
    const parsed = input.schema.safeParse(response.parsed_output);
    if (!parsed.success) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');
    return { data: parsed.data, model: response.model };
  }

  // OpenAI, OpenRouter e compatíveis: Chat Completions.
  const schema = jsonSchemaOf(input.schema);
  const jsonHint = `\n\nResponde só com um objeto JSON com este esquema, sem texto à volta:\n${JSON.stringify(schema)}`;
  const messages = (hint: string) => [
    { role: 'system', content: input.system + hint },
    { role: 'user', content: input.prompt },
  ];
  let body: Record<string, unknown>;
  try {
    body = await firstAccepted([
      () =>
        postJson(
          provider,
          '/chat/completions',
          { model, messages: messages(''), response_format: { type: 'json_schema', json_schema: { name: input.schemaName, strict: true, schema } } },
          55_000,
        ),
      () => postJson(provider, '/chat/completions', { model, messages: messages(jsonHint), response_format: { type: 'json_object' } }, 55_000),
      () => postJson(provider, '/chat/completions', { model, messages: messages(jsonHint) }, 55_000),
    ]);
  } catch (error) {
    throw httpError(error, provider);
  }
  const parsed = input.schema.safeParse(extractJson(chatText(body)));
  if (!parsed.success) throw new ApiError(502, 'Resposta incompleta da IA', 'O modelo não devolveu o formato pedido. Tenta outra vez ou escolhe outro modelo.');
  return { data: parsed.data, model: typeof body.model === 'string' ? body.model : model };
}

// -----------------------------------------------------------------------------
// Pesquisa de empresas (gerador de leads)
// -----------------------------------------------------------------------------

export interface CompanySearchInput {
  /** Instruções para o Claude (entrega pela ferramenta guardar_empresas). */
  system: string;
  /** Instruções para os outros fornecedores (entrega em JSON). */
  jsonSystem: string;
  prompt: string;
  city: string | null;
}

const companiesFrom = (value: unknown): unknown[] => {
  const list = (value as { empresas?: unknown } | null)?.empresas;
  return Array.isArray(list) ? list : [];
};

export async function searchCompanies(
  provider: ResolvedProvider,
  model: string,
  input: CompanySearchInput,
  usage: AiUsage,
): Promise<{ companies: unknown[]; model: string }> {
  if (provider.kind === 'anthropic') return searchWithClaude(provider, model, input, usage);
  if (provider.kind === 'openai') return searchWithOpenAi(provider, model, input, usage);
  if (provider.kind === 'openrouter') return searchWithOpenRouter(provider, model, input, usage);
  throw new ApiError(
    422,
    'Este fornecedor não pesquisa na internet',
    `“${provider.label}” não tem pesquisa na internet. Escolhe Claude, OpenAI ou OpenRouter para o gerador de leads em Definições → Inteligência artificial.`,
  );
}

async function searchWithClaude(provider: ResolvedProvider, model: string, input: CompanySearchInput, usage: AiUsage) {
  const tools = [
    {
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: LEAD_GENERATION_LIMITS.webSearches,
      user_location: { type: 'approximate', country: 'PT', city: input.city ?? 'Amadora', timezone: 'Europe/Lisbon' },
    },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: LEAD_GENERATION_LIMITS.webFetches },
    LEAD_GENERATION_TOOL,
  ] as unknown as BetaToolUnion[];
  const messages: BetaMessageParam[] = [{ role: 'user', content: input.prompt }];
  let asked = false;

  // Pesquisas longas pausam ("pause_turn"): reenvia-se a conversa e o servidor continua.
  for (let round = 0; round < 8; round++) {
    let response;
    try {
      response = await anthropicClientFor(provider.apiKey, { long: true }).beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      });
    } catch (error) {
      throw anthropicError(error, provider);
    }
    usage.input_tokens +=
      response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
    usage.output_tokens += response.usage.output_tokens;
    usage.searches += response.usage.server_tool_use?.web_search_requests ?? 0;

    if (response.stop_reason === 'refusal') throw new ApiError(422, 'Pedido recusado pela IA', 'Reformula o pedido e tenta outra vez.');
    const call = response.content.find((b) => b.type === 'tool_use' && b.name === LEAD_GENERATION_TOOL_NAME);
    if (call && call.type === 'tool_use') return { companies: companiesFrom(call.input), model: response.model };
    if (response.stop_reason === 'max_tokens') throw new ApiError(502, 'Resposta incompleta da IA', 'Pede menos empresas e tenta outra vez.');

    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason !== 'pause_turn') {
      // Terminou sem entregar a lista: pede-a uma vez.
      if (asked) break;
      asked = true;
      messages.push({
        role: 'user',
        content: `Chama agora a ferramenta ${LEAD_GENERATION_TOOL_NAME} com as empresas que encontraste (mesmo que sejam poucas ou nenhuma).`,
      });
    }
  }
  throw new ApiError(502, 'A IA não entregou a lista', 'Tenta outra vez, com um pedido mais concreto.');
}

const COMPANIES_SCHEMA = LEAD_GENERATION_TOOL.input_schema as unknown as Record<string, unknown>;

/** OpenAI: Responses API com a ferramenta de pesquisa na internet. */
async function searchWithOpenAi(provider: ResolvedProvider, model: string, input: CompanySearchInput, usage: AiUsage) {
  const location = { type: 'approximate', country: 'PT', city: input.city ?? 'Amadora', timezone: 'Europe/Lisbon' };
  const base = { model, instructions: input.jsonSystem, input: input.prompt };
  const format = { format: { type: 'json_schema', name: 'empresas', strict: true, schema: COMPANIES_SCHEMA } };
  let body: Record<string, unknown>;
  try {
    body = await firstAccepted([
      () => postJson(provider, '/responses', { ...base, tools: [{ type: 'web_search', user_location: location }], text: format }, 5 * 60_000),
      () => postJson(provider, '/responses', { ...base, tools: [{ type: 'web_search' }], text: format }, 5 * 60_000),
      () => postJson(provider, '/responses', { ...base, tools: [{ type: 'web_search_preview' }], text: format }, 5 * 60_000),
      () => postJson(provider, '/responses', { ...base, tools: [{ type: 'web_search' }] }, 5 * 60_000),
    ]);
  } catch (error) {
    throw httpError(error, provider);
  }
  const output = (body.output ?? []) as { type?: string; content?: { type?: string; text?: string }[] }[];
  usage.searches += output.filter((o) => o.type === 'web_search_call').length;
  const u = (body.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
  usage.input_tokens += u.input_tokens ?? 0;
  usage.output_tokens += u.output_tokens ?? 0;
  const text =
    typeof body.output_text === 'string'
      ? body.output_text
      : output
          .filter((o) => o.type === 'message')
          .flatMap((o) => o.content ?? [])
          .filter((c) => c.type === 'output_text')
          .map((c) => c.text ?? '')
          .join('');
  const parsed = extractJson(text);
  if (!parsed) throw new ApiError(502, 'A IA não entregou a lista', 'O modelo não devolveu a lista no formato pedido. Tenta outra vez ou escolhe outro modelo.');
  return { companies: companiesFrom(parsed), model: typeof body.model === 'string' ? body.model : model };
}

/** OpenRouter: Chat Completions com o plugin de pesquisa na internet. */
async function searchWithOpenRouter(provider: ResolvedProvider, model: string, input: CompanySearchInput, usage: AiUsage) {
  const messages = [
    { role: 'system', content: input.jsonSystem },
    { role: 'user', content: input.prompt },
  ];
  const plugins = [{ id: 'web', max_results: 10 }];
  let body: Record<string, unknown>;
  try {
    body = await firstAccepted([
      () =>
        postJson(
          provider,
          '/chat/completions',
          { model, messages, plugins, response_format: { type: 'json_schema', json_schema: { name: 'empresas', strict: true, schema: COMPANIES_SCHEMA } } },
          5 * 60_000,
        ),
      () => postJson(provider, '/chat/completions', { model, messages, plugins, response_format: { type: 'json_object' } }, 5 * 60_000),
      () => postJson(provider, '/chat/completions', { model, messages, plugins }, 5 * 60_000),
    ]);
  } catch (error) {
    throw httpError(error, provider);
  }
  const u = chatUsage(body);
  usage.input_tokens += u.input_tokens;
  usage.output_tokens += u.output_tokens;
  usage.searches += 1;
  const parsed = extractJson(chatText(body));
  if (!parsed) throw new ApiError(502, 'A IA não entregou a lista', 'O modelo não devolveu a lista no formato pedido. Tenta outra vez ou escolhe outro modelo.');
  return { companies: companiesFrom(parsed), model: typeof body.model === 'string' ? body.model : model };
}
