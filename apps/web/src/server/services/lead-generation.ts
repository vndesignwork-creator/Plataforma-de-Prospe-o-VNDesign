/**
 * Gerador de leads: o Claude pesquisa na internet (web search + web fetch) e
 * entrega uma lista de empresas pela ferramenta "guardar_empresas". A pesquisa
 * corre em segundo plano (1–3 minutos); a página consulta o estado.
 * As empresas só passam a leads quando o utilizador as escolhe; o site de cada
 * lead criado é analisado a seguir (também em segundo plano).
 */
import {
  FoundCompanySchema,
  AI_PROVIDER_META,
  LEAD_GENERATION_DEFAULT_MODEL,
  LEAD_GENERATION_JSON_SYSTEM_PROMPT,
  LEAD_GENERATION_SYSTEM_PROMPT,
  LeadCreateSchema,
  buildLeadGenerationPrompt,
  ensureUrlProtocol,
  estimateLeadGenerationCost,
  isDirectoryUrl,
  isSocialUrl,
  normalizeCompanyName,
  todayIso,
  type FoundCompany,
  type LeadCandidate,
  type LeadGenerationAdd,
  type LeadGenerationAddResult,
  type LeadGenerationRequest,
  type LeadGenerationRun,
} from '@vndesign/core';
import { searchCompanies, type AiUsage } from '../ai/generate';
import { resolveAiFeature, type ResolvedProvider } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseBearerClient } from '../supabase';
import { applyAudit, runLeadAudit } from './audits';
import { lookupConflicts } from './imports';
import { createLead } from './leads';
import { listSectors } from './sectors';
import { getSettings } from './workspace';
import { loadServiceCatalog } from './service-catalog';

const RUN_SELECT =
  'id, query, city, sector_id, services, max_results, status, error, candidates, model, searches, cost_usd, created_at, finished_at';
const NOT_FOUND = 'Pesquisa não encontrada';
/** Uma pesquisa "a correr" há mais do que isto foi interrompida (ex.: o servidor reiniciou). */
const STALE_MS = 10 * 60_000;

export function leadGenerationModel(): string {
  return process.env.ANTHROPIC_LEADGEN_MODEL || LEAD_GENERATION_DEFAULT_MODEL;
}

type RunRow = Omit<LeadGenerationRun, 'cost_usd'> & { cost_usd: number | string | null };

function toRun(row: RunRow): LeadGenerationRun {
  const stale = row.status === 'running' && Date.now() - new Date(row.created_at).getTime() > STALE_MS;
  return {
    ...row,
    status: stale ? 'error' : row.status,
    error: stale ? 'A pesquisa foi interrompida (o servidor reiniciou ou demorou demasiado). Tenta outra vez.' : row.error,
    cost_usd: row.cost_usd === null ? null : Number(row.cost_usd),
  };
}

export async function listLeadGenerationRuns(ctx: ApiContext): Promise<LeadGenerationRun[]> {
  const { data, error } = await ctx.supabase
    .from('lead_generation_runs')
    .select(RUN_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as RunRow[]).map(toRun);
}

export async function getLeadGenerationRun(ctx: ApiContext, id: string): Promise<LeadGenerationRun> {
  const { data, error } = await ctx.supabase
    .from('lead_generation_runs')
    .select(RUN_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  if (!data) throw new ApiError(404, NOT_FOUND);
  return toRun(data as RunRow);
}

/**
 * Contexto para trabalho em segundo plano (depois de o pedido responder): o
 * cliente da web lê os cookies do pedido, por isso passa a usar o access token.
 */
async function detachedContext(ctx: ApiContext): Promise<ApiContext> {
  if (ctx.authMethod !== 'session') return ctx;
  const { data } = await ctx.supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { ...ctx, supabase: createSupabaseBearerClient(token), authMethod: 'bearer' } : ctx;
}

/** Começa uma pesquisa e devolve-a logo ("a correr"); o resultado chega depois. */
export async function startLeadGeneration(ctx: ApiContext, request: LeadGenerationRequest): Promise<LeadGenerationRun> {
  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.lead_generation, { anthropicModel: leadGenerationModel() });
  if (!AI_PROVIDER_META[provider.kind].webSearch) {
    throw new ApiError(
      422,
      'Este fornecedor não pesquisa na internet',
      `“${provider.label}” não tem pesquisa na internet. Escolhe Claude, OpenAI ou OpenRouter para o gerador de leads em Definições → Inteligência artificial.`,
    );
  }
  const running = (await listLeadGenerationRuns(ctx)).find((r) => r.status === 'running');
  if (running) {
    throw new ApiError(409, 'Já há uma pesquisa a correr', 'Espera que termine (1 a 3 minutos) antes de começar outra.');
  }
  const { data, error } = await ctx.supabase
    .from('lead_generation_runs')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.user.id,
      query: request.query,
      city: request.city,
      sector_id: request.sector_id,
      services: request.services,
      max_results: request.max_results,
      // O fornecedor só aparece quando não é a chave do servidor (ex.: "OpenAI (ChatGPT) · gpt-5-mini").
      model: provider.id === 'server' ? model : `${provider.label} · ${model}`,
    })
    .select(RUN_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const run = toRun(data as RunRow);
  // Em segundo plano: o pedido responde já e a página vai consultando o estado.
  void executeRun(await detachedContext(ctx), run.id, request, provider, model);
  return run;
}

async function finishRun(ctx: ApiContext, id: string, patch: Record<string, unknown>) {
  const { error } = await ctx.supabase
    .from('lead_generation_runs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id);
  if (error) console.error('[gerador] não foi possível guardar o resultado', error.message);
}

async function executeRun(
  ctx: ApiContext,
  id: string,
  request: LeadGenerationRequest,
  provider: ResolvedProvider,
  model: string,
) {
  const usage: AiUsage = { input_tokens: 0, output_tokens: 0, searches: 0 };
  const totals = () => ({
    searches: usage.searches,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    // Só se conhece o preço dos modelos da Anthropic; nos outros vê-se no painel do fornecedor.
    cost_usd: provider.kind === 'anthropic' ? estimateLeadGenerationCost(model, usage) : null,
  });
  try {
    const [sectors, services, existingNames] = await Promise.all([
      listSectors(ctx, false),
      loadServiceCatalog(ctx),
      existingLeadNames(ctx, request.city),
    ]);
    const prompt = buildLeadGenerationPrompt({
      request,
      sectorName: sectors.find((s) => s.id === request.sector_id)?.name ?? null,
      sectors: sectors.map((s) => s.name),
      services,
      existingNames,
    });
    const { companies } = await searchCompanies(
      provider,
      model,
      { system: LEAD_GENERATION_SYSTEM_PROMPT, jsonSystem: LEAD_GENERATION_JSON_SYSTEM_PROMPT, prompt, city: request.city },
      usage,
    );
    const found = parseCompanies({ empresas: companies }, request.max_results);
    const candidates = await toCandidates(ctx, found, request, {
      sectors: sectors.map((s) => ({ id: s.id, name: s.name })),
      serviceKeys: new Set(services.filter((s) => !s.archived_at).map((s) => s.key)),
    });
    await finishRun(ctx, id, { status: 'done', candidates, ...totals() });
  } catch (error) {
    const message = error instanceof ApiError ? (error.detail ?? error.title) : 'Erro inesperado. Tenta outra vez.';
    if (!(error instanceof ApiError)) console.error('[gerador] erro', error);
    await finishRun(ctx, id, { status: 'error', error: message, ...totals() });
  }
}

/** Nomes dos leads que já existem na zona (para o Claude não os repetir). */
async function existingLeadNames(ctx: ApiContext, city: string | null): Promise<string[]> {
  let q = ctx.supabase
    .from('leads')
    .select('company_name')
    .eq('workspace_id', ctx.workspaceId)
    .is('anonymized_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (city) q = q.ilike('city', `%${city.replace(/[%_,()]/g, ' ').trim()}%`);
  const { data } = await q;
  return [...new Set(((data ?? []) as { company_name: string }[]).map((r) => r.company_name))];
}

/** Valida cada empresa à parte: uma mal formada não estraga as outras. */
function parseCompanies(input: unknown, max: number): FoundCompany[] {
  const list = (input as { empresas?: unknown })?.empresas;
  if (!Array.isArray(list)) return [];
  const out: FoundCompany[] = [];
  for (const item of list) {
    const parsed = FoundCompanySchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= max) break;
  }
  return out;
}

const httpUrl = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(ensureUrlProtocol(value));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

async function toCandidates(
  ctx: ApiContext,
  found: FoundCompany[],
  request: LeadGenerationRequest,
  catalog: { sectors: { id: string; name: string }[]; serviceKeys: Set<string> },
): Promise<LeadCandidate[]> {
  // Sem repetidos dentro da mesma pesquisa.
  const seen = new Set<string>();
  const unique = found.filter((c) => {
    const key = normalizeCompanyName(c.company_name) ?? c.company_name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const cleaned = unique.map((c) => {
    let website = httpUrl(c.website);
    let social = httpUrl(c.social_url);
    // Redes sociais e diretórios não são o site da empresa.
    if (website && isSocialUrl(website)) [social, website] = [social ?? website, null];
    if (website && isDirectoryUrl(website)) website = null;
    const sector =
      catalog.sectors.find((s) => s.name.toLowerCase() === c.sector?.toLowerCase()) ??
      catalog.sectors.find((s) => s.id === request.sector_id) ??
      null;
    return {
      company_name: c.company_name,
      city: c.city || request.city,
      address: c.address,
      website,
      social_url: social,
      phone: c.phone,
      email: c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) ? c.email.toLowerCase() : null,
      sector_id: sector?.id ?? null,
      sector_name: sector?.name ?? null,
      services: [...new Set(c.services.filter((k) => catalog.serviceKeys.has(k)))],
      opportunity: c.opportunity,
      approach_angle: c.approach_angle,
      source_url: httpUrl(c.source_url) ?? website ?? social ?? '',
    };
  });

  const { dups, dnc } = cleaned.length
    ? await lookupConflicts(
        ctx,
        cleaned.map((c) => ({ company_name: c.company_name, website: c.website, email: c.email })),
      )
    : { dups: [], dnc: [] };

  return cleaned.map((c, index) => {
    const blocked = dnc.find((d) => d.row_index === index);
    const strong = dups.find((d) => d.row_index === index && d.strength === 'strong');
    const possible = dups.find((d) => d.row_index === index);
    const match: LeadCandidate['match'] = blocked
      ? { status: 'do_not_contact', lead_id: null, lead_number: null, lead_name: blocked.company_name, reason: blocked.reason }
      : strong
        ? { status: 'duplicate', lead_id: strong.lead_id, lead_number: strong.number, lead_name: strong.company_name, reason: null }
        : possible
          ? { status: 'possible_duplicate', lead_id: possible.lead_id, lead_number: possible.number, lead_name: possible.company_name, reason: null }
          : { status: 'new', lead_id: null, lead_number: null, lead_name: null, reason: null };
    return { ...c, match, added_lead_id: null };
  });
}

/** Cria os leads escolhidos e, se pedido, analisa os sites em segundo plano. */
export async function addLeadGenerationCandidates(
  ctx: ApiContext,
  id: string,
  input: LeadGenerationAdd,
): Promise<LeadGenerationAddResult> {
  const run = await getLeadGenerationRun(ctx, id);
  if (run.status !== 'done') throw new ApiError(409, 'Pesquisa sem resultados', 'Espera que a pesquisa termine.');
  const candidates = [...run.candidates];
  const result: LeadGenerationAddResult = { created: [], skipped: [], audits: 0 };
  const toAudit: string[] = [];

  for (const index of [...new Set(input.indexes)].sort((a, b) => a - b)) {
    const c = candidates[index];
    if (!c) {
      result.skipped.push({ index, reason: 'Empresa não encontrada nesta pesquisa.' });
      continue;
    }
    if (c.added_lead_id) {
      result.skipped.push({ index, reason: 'Já foi adicionada.' });
      continue;
    }
    const parsed = LeadCreateSchema.safeParse({
      company_name: c.company_name,
      city: c.city,
      address: c.address,
      // Sem site próprio, a página de Facebook/Instagram fica no Website (como no formulário).
      website: c.website ?? c.social_url,
      phone: c.phone,
      email: c.email,
      sector_id: c.sector_id,
      services: c.services,
      approach_angle: c.approach_angle,
      source_url: c.source_url || null,
      suggested_on: todayIso(),
      notes: `Encontrado pelo gerador de leads (“${run.query}”): ${c.opportunity}`,
    });
    if (!parsed.success) {
      result.skipped.push({ index, reason: 'Dados inválidos: corrige-os depois de criar o lead manualmente.' });
      continue;
    }
    try {
      const lead = await createLead(ctx, parsed.data);
      candidates[index] = { ...c, added_lead_id: lead.id };
      result.created.push({ index, lead_id: lead.id, number: lead.number });
      if (c.website) toAudit.push(lead.id);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
        result.skipped.push({
          index,
          reason: error.status === 409 ? 'Já existe um lead igual.' : 'Está na lista “não contactar”.',
        });
        continue;
      }
      throw error;
    }
  }

  const { error } = await ctx.supabase
    .from('lead_generation_runs')
    .update({ candidates })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id);
  if (error) throw fromPostgrest(error);

  if (input.audit && toAudit.length) {
    result.audits = toAudit.length;
    void auditLeads(await detachedContext(ctx), toAudit);
  }
  return result;
}

/** Analisa o site de cada lead novo e aplica os resultados (PageSpeed, Mobile?, Problemas). */
async function auditLeads(ctx: ApiContext, leadIds: string[]) {
  const queue = [...leadIds];
  const worker = async () => {
    for (let leadId = queue.shift(); leadId; leadId = queue.shift()) {
      try {
        const audit = await runLeadAudit(ctx, leadId);
        if (audit.status === 'done') {
          await applyAudit(ctx, leadId, audit.id, { fields: ['pagespeed', 'mobile', 'problems'], problems_mode: 'replace' }).catch(
            () => undefined, // nada para aplicar
          );
        }
      } catch (error) {
        console.warn('[gerador] análise do site falhou', leadId, error instanceof Error ? error.message : error);
      }
    }
  };
  await Promise.all([worker(), worker()]);
}
