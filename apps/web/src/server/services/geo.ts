/**
 * Mapa dos leads e geocodificação das moradas com o OpenStreetMap (Nominatim).
 * Regras de utilização do Nominatim: no máximo 1 pedido por segundo e um
 * User-Agent identificável — por isso a geocodificação é feita em lotes.
 * GEOCODER_URL permite usar outro servidor compatível (ou um servidor de testes).
 */
import { buildGeocodeQueries, parseNominatimResponse, type GeocodeBatchResult, type MapData, type MapLead } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getLead, type LeadFilters, applyLeadFiltersTo } from './leads';

const GEOCODER_URL = () => process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'VNDesignLeads/1.0 (+https://vndesign.pt)';
/** Sem pausa só para um servidor local (testes); qualquer servidor público leva no máximo 1 pedido/segundo. */
const DELAY_MS = () => (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(GEOCODER_URL()) ? 0 : 1100);
const BATCH_TIME_MS = 40_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fila única: mesmo com vários lotes ao mesmo tempo, os pedidos saem um de cada vez, com a pausa entre eles.
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequest + DELAY_MS() - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

function geocode(q: string) {
  return throttled(async () => {
    const params = new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: 'pt', 'accept-language': 'pt-PT' });
    const res = await fetch(`${GEOCODER_URL()}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) throw new ApiError(429, 'Demasiados pedidos', 'O serviço de mapas pediu uma pausa. Tenta daqui a um minuto.');
    if (!res.ok) throw new ApiError(502, 'Serviço de mapas indisponível', `O geocodificador respondeu ${res.status}.`);
    return parseNominatimResponse(await res.json());
  });
}

type LeadForGeocode = { id: string; company_name: string; address: string | null; city: string | null };

/** Tenta morada → empresa + cidade → só a cidade. */
async function locate(lead: LeadForGeocode) {
  for (const query of buildGeocodeQueries(lead)) {
    const hit = await geocode(query.q);
    if (hit) return { ...hit, status: query.approximate ? ('approx' as const) : ('ok' as const) };
  }
  return null;
}

async function saveLocation(ctx: ApiContext, id: string, lat: number | null, lng: number | null, status: string) {
  const { error } = await ctx.supabase.rpc('set_lead_location', {
    p_lead_id: id,
    p_latitude: lat,
    p_longitude: lng,
    p_status: status,
  });
  if (error) throw fromPostgrest(error, 'Lead não encontrado');
}

export async function geocodeLead(ctx: ApiContext, leadId: string) {
  const lead = await getLead(ctx, leadId);
  if (!buildGeocodeQueries(lead).length) {
    throw new ApiError(422, 'Sem morada', 'Preenche a morada ou a cidade do lead para o localizar no mapa.');
  }
  const hit = await locate(lead);
  await saveLocation(ctx, leadId, hit?.latitude ?? null, hit?.longitude ?? null, hit?.status ?? 'not_found');
  return getLead(ctx, leadId);
}

export async function setLeadLocation(ctx: ApiContext, leadId: string, latitude: number, longitude: number) {
  await getLead(ctx, leadId);
  await saveLocation(ctx, leadId, latitude, longitude, 'manual');
  return getLead(ctx, leadId);
}

/** Localiza os leads ainda sem coordenadas (em lotes, para respeitar os limites). */
export async function geocodeMissing(ctx: ApiContext, limit = 25): Promise<GeocodeBatchResult> {
  const pending = () =>
    ctx.supabase
      .from('leads')
      .select('id, company_name, address, city', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId)
      .is('anonymized_at', null)
      .is('geocode_status', null)
      .or('address.not.is.null,city.not.is.null');
  const { data, error } = await pending().order('number').limit(limit);
  if (error) throw fromPostgrest(error);

  const result = { processed: 0, found: 0, approximate: 0, not_found: 0 };
  const started = Date.now();
  for (const lead of (data ?? []) as LeadForGeocode[]) {
    if (Date.now() - started > BATCH_TIME_MS) break;
    const hit = await locate(lead);
    await saveLocation(ctx, lead.id, hit?.latitude ?? null, hit?.longitude ?? null, hit?.status ?? 'not_found');
    result.processed++;
    if (!hit) result.not_found++;
    else if (hit.status === 'approx') result.approximate++;
    else result.found++;
  }
  const { count } = await pending().limit(1);
  return { ...result, remaining: count ?? 0 };
}

const MAP_SELECT =
  'id, number, company_name, status, city, address, latitude, longitude, geocode_status, estimated_value, next_action_on, sector:sectors(id, name, emoji, icon)';

export async function getMapData(ctx: ApiContext, filters: LeadFilters): Promise<MapData> {
  const located = applyLeadFiltersTo(
    ctx.supabase.from('leads').select(MAP_SELECT).eq('workspace_id', ctx.workspaceId),
    filters,
  )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(5000);
  const counts = (status: 'missing' | 'not_found') => {
    let q = ctx.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspaceId)
      .is('anonymized_at', null);
    q = status === 'missing' ? q.is('geocode_status', null).or('address.not.is.null,city.not.is.null') : q.eq('geocode_status', 'not_found');
    return q;
  };
  const [rows, missing, notFound] = await Promise.all([located, counts('missing'), counts('not_found')]);
  if (rows.error) throw fromPostgrest(rows.error);
  const leads = ((rows.data ?? []) as unknown as MapLead[]).map((l) => ({
    ...l,
    estimated_value: l.estimated_value === null ? null : Number(l.estimated_value),
  }));
  return { leads, counts: { located: leads.length, missing: missing.count ?? 0, not_found: notFound.count ?? 0 } };
}
