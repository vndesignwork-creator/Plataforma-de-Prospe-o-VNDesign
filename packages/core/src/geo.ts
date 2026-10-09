/**
 * Mapa: pesquisas de geocodificação (OpenStreetMap/Nominatim) a partir dos
 * dados do lead e leitura da resposta.
 */
import { z } from 'zod';
import { LeadStatusSchema } from './schemas';

export const GEOCODE_STATUSES = ['ok', 'approx', 'manual', 'not_found'] as const;
export type GeocodeStatus = (typeof GEOCODE_STATUSES)[number];
export const GEOCODE_STATUS_LABELS: Record<GeocodeStatus, string> = {
  ok: 'Morada encontrada',
  approx: 'Aproximada (cidade)',
  manual: 'Escolhida no mapa',
  not_found: 'Não encontrada',
};

export interface GeocodeQuery {
  q: string;
  /** true = só a cidade (posição aproximada). */
  approximate: boolean;
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Pesquisas a tentar por ordem: morada → empresa + cidade → só a cidade. */
export function buildGeocodeQueries(lead: {
  company_name: string;
  address?: string | null;
  city?: string | null;
}): GeocodeQuery[] {
  const address = clean(lead.address);
  const city = clean(lead.city);
  const company = clean(lead.company_name);
  const queries: GeocodeQuery[] = [];
  const withCity = (s: string) => (city && !s.toLowerCase().includes(city.toLowerCase()) ? `${s}, ${city}` : s);
  if (address) queries.push({ q: `${withCity(address)}, Portugal`, approximate: false });
  if (company && city) queries.push({ q: `${company}, ${city}, Portugal`, approximate: false });
  if (city) queries.push({ q: `${city}, Portugal`, approximate: true });
  return queries;
}

/** Primeiro resultado de uma resposta Nominatim (format=jsonv2). */
export function parseNominatimResponse(json: unknown): { latitude: number; longitude: number; label: string } | null {
  if (!Array.isArray(json) || !json.length) return null;
  const first = json[0] as { lat?: string; lon?: string; display_name?: string };
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, label: first.display_name ?? '' };
}

export const MapLeadSchema = z
  .object({
    id: z.uuid(),
    number: z.int(),
    company_name: z.string(),
    status: LeadStatusSchema,
    city: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    geocode_status: z.enum(GEOCODE_STATUSES).nullable(),
    estimated_value: z.number().nullable(),
    next_action_on: z.string().nullable(),
    sector: z.object({ id: z.uuid(), name: z.string(), emoji: z.string().nullable(), icon: z.string().nullable().optional() }).nullable(),
  })
  .meta({ id: 'MapLead' });
export type MapLead = z.infer<typeof MapLeadSchema>;

export const MapDataSchema = z
  .object({
    leads: z.array(MapLeadSchema),
    counts: z.object({ located: z.int(), missing: z.int(), not_found: z.int() }),
  })
  .meta({ id: 'MapData' });
export type MapData = z.infer<typeof MapDataSchema>;

export const LeadLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .meta({ id: 'LeadLocation' });

export const GeocodeBatchResultSchema = z
  .object({
    processed: z.int(),
    found: z.int(),
    approximate: z.int(),
    not_found: z.int(),
    remaining: z.int(),
  })
  .meta({ id: 'GeocodeBatchResult' });
export type GeocodeBatchResult = z.infer<typeof GeocodeBatchResultSchema>;
