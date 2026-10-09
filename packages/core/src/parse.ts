/**
 * Leitura tolerante de valores escritos à mão ou vindos da folha
 * (ex.: "🔍 Identificado", "✅ Sim", "08/10/2026", "1.250,00 €", "--").
 * Usado na importação CSV/XLSX e na API de integração.
 */
import {
  LEAD_CHANNEL_META,
  LEAD_CHANNELS,
  LEAD_STATUS_META,
  LEAD_STATUSES,
  MOBILE_STATUS_META,
  MOBILE_STATUSES,
  type LeadChannel,
  type LeadStatus,
  type MobileStatus,
} from './enums';
import { isBlank, normalizeText, slugify } from './normalize';

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** Remove emojis ("🔍 Identificado" → "Identificado"). */
export function stripEmoji(value: string): string {
  return value.replace(EMOJI, '').replace(/\s+/g, ' ').trim();
}

function matchEnum<T extends string>(
  value: unknown,
  codes: readonly T[],
  labels: Record<T, { label: string }>,
  aliases: Record<string, T> = {},
): T | null {
  if (typeof value !== 'string' || isBlank(value)) return null;
  const key = slugify(stripEmoji(value));
  if (key === '') return null;
  for (const code of codes) {
    if (slugify(code) === key || slugify(labels[code].label) === key) return code;
  }
  return aliases[key] ?? null;
}

export function parseStatus(value: unknown): LeadStatus | null {
  return matchEnum(value, LEAD_STATUSES, LEAD_STATUS_META, {
    proposta: 'proposta_enviada',
    ganho: 'cliente',
    perdido: 'sem_interesse',
    pausa: 'em_pausa',
    novo: 'identificado',
  });
}

export function parseChannel(value: unknown): LeadChannel | null {
  return matchEnum(value, LEAD_CHANNELS, LEAD_CHANNEL_META, {
    'e-mail': 'email',
    mail: 'email',
    telemovel: 'telefone',
    chamada: 'telefone',
    whatsapp: 'telefone',
    maps: 'google_maps',
    presencial: 'pessoal',
    facebook: 'outro',
  });
}

export function parseMobile(value: unknown): MobileStatus {
  const parsed = matchEnum(value, MOBILE_STATUSES, MOBILE_STATUS_META, {
    nao: 'nao',
    no: 'nao',
    yes: 'sim',
    s: 'sim',
    n: 'nao',
  });
  return parsed ?? 'desconhecido';
}

/** Encontra o setor pelo nome ou slug, ignorando emoji, acentos e espaços. */
export function matchSector<S extends { id: string; name: string; slug: string }>(
  value: unknown,
  sectors: readonly S[],
): S | null {
  if (typeof value !== 'string' || isBlank(value)) return null;
  const key = slugify(stripEmoji(value));
  return sectors.find((s) => s.slug === key || slugify(s.name) === key) ?? null;
}

/**
 * Datas em formato português (DD/MM/AAAA, DD-MM-AAAA, DD/MM/AA) ou ISO.
 * Devolve "AAAA-MM-DD" ou null se inválida.
 */
export function parsePtDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || isBlank(value)) return null;
  const s = value.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const pt = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (pt) {
    [d, m, y] = [Number(pt[1]), Number(pt[2]), Number(pt[3])];
    if (y < 100) y += 2000;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y.toString().padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "1.250,50 €" → 1250.5; "1250" → 1250; "--" → null. */
export function parseEuroAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || isBlank(value)) return null;
  let s = value.replace(/[€\s ]/g, '').replace(/eur/i, '');
  if (s.includes(',')) {
    // formato pt-PT: ponto = milhares, vírgula = decimais
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(Number((n * 100).toPrecision(12))) / 100 : null;
}

/** PageSpeed 0–100 ("34", "34/100", 34). */
export function parsePageSpeed(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && !isBlank(value)
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Texto livre: "--" e vazio passam a null. Tira o apóstrofo que a exportação
 * CSV põe antes de "+", "=", "-" e "@" (proteção do Excel), para que exportar
 * e voltar a importar não estrague telefones como "+351 912 345 678".
 */
export function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/^'(?=[=+\-@])/, '');
  return isBlank(s) ? null : s;
}

/** Compara texto ignorando maiúsculas/acentos (útil em filtros). */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeText(a) === normalizeText(b);
}
