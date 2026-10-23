/**
 * GEO — "Aparece nas IAs?": pergunta a uma IA com pesquisa na internet o que
 * um cliente perguntaria e vê se o lead aparece nas respostas (e quem aparece
 * no lugar dele). Corre em segundo plano: o pedido responde já e a ficha vai
 * consultando o estado.
 */
import {
  AI_PROVIDER_META,
  AI_VISIBILITY_JSON_SYSTEM_PROMPT,
  AI_VISIBILITY_LIMITS,
  AI_VISIBILITY_SYSTEM_PROMPT,
  AI_VISIBILITY_TOOL,
  assistantName,
  buildVisibilityPrompt,
  estimateLeadGenerationCost,
  matchVisibility,
  parseVisibilityAnswers,
  visibilitySummary,
  type AiVisibilityCheck,
  type AiVisibilityRequest,
} from '@vndesign/core';
import { searchStructured, type AiUsage } from '../ai/generate';
import { resolveAiFeature, type ResolvedProvider } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { detachedContext, leadGenerationModel } from './lead-generation';
import { getLead } from './leads';
import { getSettings } from './workspace';

const SELECT = 'id, lead_id, status, questions, results, competitors, mentioned_count, assistant, model, searches, cost_usd, error, created_at, finished_at';
/** Uma pesquisa "a correr" há mais do que isto ficou pendurada (ex.: o servidor reiniciou). */
const STALE_MS = 10 * 60_000;

type Row = Omit<AiVisibilityCheck, 'summary' | 'cost_usd'> & { cost_usd: number | string | null };

function toCheck(row: Row): AiVisibilityCheck {
  const stale = row.status === 'running' && Date.now() - new Date(row.created_at).getTime() > STALE_MS;
  const status = stale ? 'error' : row.status;
  return {
    ...row,
    status,
    error: stale ? 'A pesquisa não terminou. Tenta outra vez.' : row.error,
    cost_usd: row.cost_usd === null ? null : Number(row.cost_usd),
    summary: status === 'done' ? visibilitySummary(row) : null,
  };
}

/** Os últimos testes deste lead (o mais recente primeiro). */
export async function listVisibilityChecks(ctx: ApiContext, leadId: string): Promise<AiVisibilityCheck[]> {
  const { data, error } = await ctx.supabase
    .from('ai_visibility_checks')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as unknown as Row[]).map(toCheck);
}

export async function startVisibilityCheck(ctx: ApiContext, leadId: string, input: AiVisibilityRequest): Promise<AiVisibilityCheck> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(409, 'Lead anonimizado', 'Este lead foi anonimizado.');
  const running = (await listVisibilityChecks(ctx, leadId)).find((c) => c.status === 'running');
  if (running) throw new ApiError(409, 'Já há um teste a correr', 'Espera que termine (1 a 3 minutos).');

  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.visibility, { anthropicModel: leadGenerationModel() });
  if (!AI_PROVIDER_META[provider.kind].webSearch) {
    throw new ApiError(
      422,
      'Este fornecedor não pesquisa na internet',
      `“${provider.label}” não tem pesquisa na internet. Escolhe Claude, OpenAI ou OpenRouter para “Aparece nas IAs?” em Definições → Inteligência artificial.`,
    );
  }
  const questions = input.questions.slice(0, AI_VISIBILITY_LIMITS.questions);
  const { data, error } = await ctx.supabase
    .from('ai_visibility_checks')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      questions,
      assistant: assistantName(provider.kind, provider.label),
      model: provider.id === 'server' ? model : `${provider.label} · ${model}`,
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const check = toCheck(data as unknown as Row);
  void executeCheck(await detachedContext(ctx), check.id, questions, { company_name: lead.company_name, website: lead.website, city: lead.city }, provider, model);
  return check;
}

async function finish(ctx: ApiContext, id: string, patch: Record<string, unknown>) {
  const { error } = await ctx.supabase
    .from('ai_visibility_checks')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id);
  if (error) console.error('[visibilidade] não foi possível guardar o resultado', error.message);
}

async function executeCheck(
  ctx: ApiContext,
  id: string,
  questions: string[],
  lead: { company_name: string; website: string | null; city: string | null },
  provider: ResolvedProvider,
  model: string,
) {
  const usage: AiUsage = { input_tokens: 0, output_tokens: 0, searches: 0 };
  const totals = () => ({
    searches: usage.searches,
    // Só se conhece o preço dos modelos da Anthropic; nos outros vê-se no painel do fornecedor.
    cost_usd: provider.kind === 'anthropic' ? estimateLeadGenerationCost(model, usage) : null,
  });
  try {
    const { data } = await searchStructured(
      provider,
      model,
      {
        system: AI_VISIBILITY_SYSTEM_PROMPT,
        jsonSystem: AI_VISIBILITY_JSON_SYSTEM_PROMPT,
        // A IA não sabe qual é o lead: responde como a qualquer pessoa.
        prompt: buildVisibilityPrompt(questions),
        city: lead.city,
        tool: AI_VISIBILITY_TOOL,
        schemaName: 'respostas',
        limits: { webSearches: AI_VISIBILITY_LIMITS.webSearches, webFetches: 0 },
        labels: { feature: '“Aparece nas IAs?”', missing: 'A IA não entregou as respostas', retry: 'Tenta outra vez.' },
      },
      usage,
    );
    const matched = matchVisibility(parseVisibilityAnswers(data, questions), lead);
    await finish(ctx, id, { status: 'done', ...matched, ...totals() });
  } catch (error) {
    const message = error instanceof ApiError ? (error.detail ?? error.title) : 'Erro inesperado. Tenta outra vez.';
    if (!(error instanceof ApiError)) console.error('[visibilidade] erro', error);
    await finish(ctx, id, { status: 'error', error: message, ...totals() });
  }
}
