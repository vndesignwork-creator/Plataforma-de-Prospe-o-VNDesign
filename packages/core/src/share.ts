/**
 * "Partilhar → VNDesign Leads" no telemóvel: interpretar o que chega do Google
 * Maps, do Instagram, do Facebook ou de um site (título, texto e link) e montar
 * um lead novo. Aqui só a parte "pura" (sem rede); o servidor resolve os links
 * curtos e lê o site.
 */
import { z } from 'zod';

export const SharePayloadSchema = z
  .object({
    title: z.string().trim().max(500).optional().default(''),
    text: z.string().trim().max(4000).optional().default(''),
    url: z.string().trim().max(2000).optional().default(''),
  })
  .meta({ id: 'SharePayload' });
export type SharePayload = z.output<typeof SharePayloadSchema>;

export const SharedLeadDraftSchema = z
  .object({
    company_name: z.string().nullable(),
    website: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    source_url: z.string().nullable(),
    /** Canal do lead (onde foi encontrado): Google Maps ou Instagram. */
    channel: z.enum(['instagram', 'google_maps']).nullable(),
    /** De onde veio cada dado, para mostrar ("Google Maps", "site", …). */
    found: z.array(z.string()),
  })
  .meta({ id: 'SharedLeadDraft' });
export type SharedLeadDraft = z.infer<typeof SharedLeadDraftSchema>;

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export type ShareLinkKind = 'maps' | 'instagram' | 'facebook' | 'website';

/** Tipo de link: Google Maps, Instagram, Facebook ou o site da empresa. */
export function shareLinkKind(url: string): ShareLinkKind | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && u.pathname.startsWith('/maps')) || host.startsWith('maps.google.')) return 'maps';
  if (/^google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps')) return 'maps';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'facebook.com' || host === 'fb.com' || host === 'm.facebook.com' || host === 'fb.me') return 'facebook';
  if (/(^|\.)(google|goo\.gl|bit\.ly|tiktok|linkedin|youtube|youtu\.be|wa\.me|whatsapp)\./.test(`.${host}.`)) return null;
  return 'website';
}

/** Separa o que foi partilhado em links e linhas de texto (sem os links). */
export function splitShared(payload: SharePayload): { urls: string[]; lines: string[] } {
  const all = [payload.url, payload.text, payload.title].join('\n');
  const urls = [...new Set((all.match(URL_RE) ?? []).map((u) => u.replace(/[).,;!?]+$/, '')))];
  const lines = [payload.title, payload.text]
    .join('\n')
    .replace(URL_RE, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[-–—·|]+$/.test(l));
  return { urls, lines: [...new Set(lines)] };
}

/** "Rua X 12, 1000-001 Lisboa" → "Lisboa" (código postal português). */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = /\b\d{4}-\d{3}\s+([^,\d][^,]*?)(?:,|$)/.exec(address);
  return m?.[1] ? m[1].trim() : null;
}

/** Parece uma morada (número, código postal ou palavras de rua)? */
export function looksLikeAddress(line: string): boolean {
  return /\b\d{4}-\d{3}\b/.test(line) || /^(r\.|rua|av\.?|avenida|largo|praça|travessa|estrada|alameda|calçada|beco|quinta)\b/i.test(line);
}

/** Nome e coordenadas de um link longo do Google Maps (…/maps/place/<nome>/@lat,lng…). */
export function parseMapsPlaceUrl(url: string): { name: string | null; lat: number | null; lng: number | null } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { name: null, lat: null, lng: null };
  }
  // Consentimento de cookies da Google (UE): o destino vem em "continue".
  const cont = u.hostname.startsWith('consent.') ? u.searchParams.get('continue') : null;
  if (cont) return parseMapsPlaceUrl(cont);
  const place = /\/maps\/place\/([^/]+)/.exec(u.pathname)?.[1];
  let name: string | null = null;
  if (place) {
    try {
      name = decodeURIComponent(place.replace(/\+/g, ' ')).trim() || null;
    } catch {
      name = place.replace(/\+/g, ' ');
    }
  }
  const q = u.searchParams.get('q');
  if (!name && q && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) name = q.trim();
  const precise = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  const coords = precise ?? at;
  return { name, lat: coords ? Number(coords[1]) : null, lng: coords ? Number(coords[2]) : null };
}

/** Perfil de Instagram/Facebook: o nome de utilizador (null em publicações e páginas genéricas). */
export function socialHandle(url: string): string | null {
  try {
    const u = new URL(url);
    const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
    if (!first || ['p', 'reel', 'reels', 'stories', 'explore', 'share', 'sharer', 'watch', 'profile.php', 'pages', 'groups', 'events'].includes(first)) return null;
    return /^[A-Za-z0-9._-]{2,60}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

/** "padaria.sol_lisboa" → "Padaria Sol Lisboa" (quando não há melhor nome). */
export function prettifyHandle(handle: string): string {
  return handle
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** "Veja o perfil de Padaria Sol (@padariasol) no Instagram" → "Padaria Sol". */
export function nameFromSocialText(lines: string[]): string | null {
  for (const line of lines) {
    const m = /^(?:.*?\bde\s+|.*?\bfrom\s+)?(.+?)\s*\(@[\w.]+\)/i.exec(line);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/** Título, telefones e emails visíveis numa página (links tel:/mailto: primeiro). */
export function pageContacts(html: string): { title: string | null; phones: string[]; emails: string[] } {
  const head = html.slice(0, 400_000);
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
  const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(head)?.[1];
  const rawTitle = og ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? null;
  const title = rawTitle ? (decode(rawTitle).split(/\s+[|–—-]\s+/)[0] ?? '').replace(/\s+/g, ' ').trim() || null : null;
  const phones = [
    ...new Set(
      [...head.matchAll(/href=["']tel:([^"']+)["']/gi)]
        .map((m) => decodeURIComponent(m[1] ?? '').replace(/[^\d+]/g, ''))
        .filter((p) => p.replace(/\D/g, '').length >= 9),
    ),
  ];
  const emails = [
    ...new Set(
      [...head.matchAll(/href=["']mailto:([^"'?]+)/gi), ...head.matchAll(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)]
        .map((m) => decodeURIComponent(m[1] ?? '').toLowerCase())
        .filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !/(example|sentry|wixpress|domain)\./.test(e)),
    ),
  ];
  return { title, phones, emails };
}

/** Telefone português legível: "+351912345678" → "+351 912 345 678". */
export function formatSharedPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  const n = /^(?:\+?351)?(\d{9})$/.exec(digits)?.[1];
  if (!n) return raw.trim();
  return `+351 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}
