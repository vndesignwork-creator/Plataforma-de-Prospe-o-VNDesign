/**
 * Kit GEO de um lead: dados do negócio (schema.org / llms.txt), perguntas
 * frequentes geradas pela IA e o perfil do Google (nota e avaliações) com os
 * concorrentes que as IAs recomendam.
 * O perfil do Google usa a Google Places API se houver GOOGLE_PLACES_API_KEY
 * (exato); senão, a IA com pesquisa na internet (aproximado).
 */
import {
  AI_PROVIDER_META,
  GEO_FAQ_SYSTEM_PROMPT,
  GOOGLE_CHECK_JSON_SYSTEM_PROMPT,
  GOOGLE_CHECK_SYSTEM_PROMPT,
  GOOGLE_CHECK_TOOL,
  GeoFaqDraftSchema,
  GeoFaqItemSchema,
  buildFaqPrompt,
  buildGoogleCheckPrompt,
  businessFromLead,
  parseGoogleProfiles,
  similarCompanyName,
  websiteKey,
  type GeoBusiness,
  type GeoFaqItem,
  type GoogleCheck,
  type GoogleProfile,
  type LeadGeo,
} from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson, searchStructured, type AiUsage } from '../ai/generate';
import { resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { listVisibilityChecks } from './ai-visibility';
import { leadGenerationModel } from './lead-generation';
import { getLead } from './leads';
import { loadServiceCatalog } from './service-catalog';
import { getSettings } from './workspace';

type Row = { business: GeoBusiness | null; faq: GeoFaqItem[]; faq_generated_at: string | null; google: GoogleCheck | null };

async function loadRow(ctx: ApiContext, leadId: string): Promise<Row | null> {
  const { data, error } = await ctx.supabase
    .from('lead_geo')
    .select('business, faq, faq_generated_at, google')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  return (data as Row | null) ?? null;
}

async function saveRow(ctx: ApiContext, leadId: string, patch: Partial<Row>) {
  const { error } = await ctx.supabase
    .from('lead_geo')
    .upsert({ workspace_id: ctx.workspaceId, lead_id: leadId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,lead_id' });
  if (error) throw fromPostgrest(error);
}

export async function getLeadGeo(ctx: ApiContext, leadId: string): Promise<LeadGeo> {
  const [lead, row, catalog] = await Promise.all([getLead(ctx, leadId), loadRow(ctx, leadId), loadServiceCatalog(ctx)]);
  const labels = (lead.services ?? []).map((k) => catalog.find((s) => s.key === k)?.label).filter((l): l is string => !!l);
  return {
    // Enquanto não for guardado, sugere a partir da ficha (que pode ter mudado).
    business: row?.business ?? businessFromLead(lead, labels),
    business_saved: !!row?.business,
    faq: row?.faq ?? [],
    faq_generated_at: row?.faq_generated_at ?? null,
    google: row?.google ?? null,
  };
}

export async function updateLeadGeo(ctx: ApiContext, leadId: string, patch: { business?: GeoBusiness; faq?: GeoFaqItem[] }): Promise<LeadGeo> {
  await getLead(ctx, leadId);
  await saveRow(ctx, leadId, {
    ...(patch.business ? { business: patch.business } : {}),
    ...(patch.faq ? { faq: patch.faq } : {}),
  });
  return getLeadGeo(ctx, leadId);
}

/** Perguntas frequentes com IA (usa o fornecedor do "Email com IA"). */
export async function generateFaq(ctx: ApiContext, leadId: string): Promise<LeadGeo> {
  const geo = await getLeadGeo(ctx, leadId);
  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.email, { anthropicModel: aiModel() });
  const b = geo.business;
  const { data } = await generateJson(provider, model, {
    system: GEO_FAQ_SYSTEM_PROMPT,
    prompt: buildFaqPrompt({ name: b.name, type: b.type, city: b.city, services: b.services, description: b.description, website: b.url }),
    schema: GeoFaqDraftSchema,
    schemaName: 'perguntas_frequentes',
  });
  const faq = data.perguntas
    .map((p) => GeoFaqItemSchema.safeParse({ question: p.pergunta, answer: p.resposta }))
    .filter((r) => r.success)
    .map((r) => r.data!)
    .slice(0, 12);
  if (!faq.length) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');
  await saveRow(ctx, leadId, { faq, faq_generated_at: new Date().toISOString() });
  return getLeadGeo(ctx, leadId);
}

// -----------------------------------------------------------------------------
// Perfil do Google
// -----------------------------------------------------------------------------

type Target = { name: string; city: string | null; website: string | null; phone?: string | null; address?: string | null };

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').replace(/^351(?=\d{9}$)/, '');

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

/** Google Places API (New): procura pelo nome e cidade e escolhe o resultado certo (site ou nome). */
async function placesLookup(key: string, t: Target): Promise<GoogleProfile> {
  const res = await fetch(process.env.PLACES_ENDPOINT || PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber',
    },
    body: JSON.stringify({ textQuery: [t.name, t.city].filter(Boolean).join(' '), languageCode: 'pt', regionCode: 'PT', pageSize: 5 }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as {
    places?: {
      displayName?: { text?: string };
      rating?: number;
      userRatingCount?: number;
      googleMapsUri?: string;
      formattedAddress?: string;
      websiteUri?: string;
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
    }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    throw new ApiError(502, 'Google Places', `A Google respondeu: ${json?.error?.message ?? `HTTP ${res.status}`}. Confirma a chave GOOGLE_PLACES_API_KEY e que a Places API (New) está ativada.`);
  }
  const places = json?.places ?? [];
  const site = websiteKey(t.website);
  const phone = digits(t.phone);
  // O mesmo site, o mesmo telefone ou o nome escrito de outra forma ("Soc." / "Sociedade", "Lda").
  const hit =
    (site ? places.find((p) => websiteKey(p.websiteUri) === site) : undefined) ??
    (phone.length >= 9 ? places.find((p) => [p.nationalPhoneNumber, p.internationalPhoneNumber].some((n) => digits(n) === phone)) : undefined) ??
    places.find((p) => similarCompanyName(p.displayName?.text, t.name));
  if (!hit) return { name: t.name, found: false, rating: null, reviews: null, maps_url: null, address: null };
  return {
    name: t.name,
    found: true,
    rating: typeof hit.rating === 'number' ? Math.round(hit.rating * 10) / 10 : null,
    reviews: typeof hit.userRatingCount === 'number' ? hit.userRatingCount : 0,
    maps_url: hit.googleMapsUri ?? null,
    address: hit.formattedAddress ?? null,
  };
}

/** Sem chave da Places API: a IA (com pesquisa) procura os perfis. */
async function aiLookup(ctx: ApiContext, targets: Target[], city: string | null): Promise<GoogleProfile[]> {
  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.visibility, { anthropicModel: leadGenerationModel() });
  if (!AI_PROVIDER_META[provider.kind].webSearch) {
    throw new ApiError(
      422,
      'Este fornecedor não pesquisa na internet',
      `“${provider.label}” não tem pesquisa na internet. Escolhe Claude, OpenAI ou OpenRouter para “Aparece nas IAs?” em Definições → Inteligência artificial, ou configura GOOGLE_PLACES_API_KEY.`,
    );
  }
  const usage: AiUsage = { input_tokens: 0, output_tokens: 0, searches: 0 };
  const { data } = await searchStructured(
    provider,
    model,
    {
      system: GOOGLE_CHECK_SYSTEM_PROMPT,
      jsonSystem: GOOGLE_CHECK_JSON_SYSTEM_PROMPT,
      prompt: buildGoogleCheckPrompt(targets),
      city,
      tool: GOOGLE_CHECK_TOOL,
      schemaName: 'perfis',
      limits: { webSearches: 10, webFetches: 0 },
      labels: { feature: 'o perfil do Google', missing: 'A IA não entregou os perfis', retry: 'Tenta outra vez.' },
    },
    usage,
  );
  return parseGoogleProfiles(data, targets.map((t) => t.name));
}

/** Nota e avaliações no Google do lead e dos concorrentes do último "Aparece nas IAs?". */
export async function checkGoogleProfile(ctx: ApiContext, leadId: string): Promise<LeadGeo> {
  const lead = await getLead(ctx, leadId);
  const latest = (await listVisibilityChecks(ctx, leadId)).find((c) => c.status === 'done');
  const competitors: Target[] = (latest?.competitors ?? []).slice(0, 3).map((c) => ({ name: c.name, city: lead.city, website: c.website }));
  const targets: Target[] = [{ name: lead.company_name, city: lead.city, website: lead.website, phone: lead.phone, address: lead.address }, ...competitors];
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const profiles = key ? await Promise.all(targets.map((t) => placesLookup(key, t))) : await aiLookup(ctx, targets, lead.city);
  const google: GoogleCheck = {
    source: key ? 'places' : 'ia',
    checked_at: new Date().toISOString(),
    lead: profiles[0]!,
    competitors: profiles.slice(1),
  };
  await saveRow(ctx, leadId, { google });
  return getLeadGeo(ctx, leadId);
}
