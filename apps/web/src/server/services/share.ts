/**
 * "Partilhar → VNDesign Leads": transforma o que chegou do Google Maps, do
 * Instagram, do Facebook ou de um site num lead novo (por gravar).
 *  - Google Maps: resolve o link curto (sem abrir a página da Google) para ler o
 *    nome; com GOOGLE_PLACES_API_KEY pede também o telefone, o site e a morada.
 *  - Site: lê a página (com a mesma proteção da análise de sites) para o nome,
 *    o telefone e o email.
 */
import {
  cityFromAddress,
  formatSharedPhone,
  looksLikeAddress,
  nameFromSocialText,
  pageContacts,
  parseMapsPlaceUrl,
  prettifyHandle,
  shareLinkKind,
  socialHandle,
  splitShared,
  type SharePayload,
  type SharedLeadDraft,
} from '@vndesign/core';
import { safeGet } from '../audit/safe-request';

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

/** Segue o link curto do Maps até ao endereço longo (para antes de abrir a página da Google). */
async function resolveMapsLink(url: string): Promise<string> {
  if (!/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) return url;
  try {
    const res = await safeGet(url, {
      timeoutMs: 8_000,
      maxBytes: 100_000,
      maxRedirects: 4,
      stopAt: (next) => /\/maps\/place\/|[?&]q=/.test(next.toString()) || next.hostname.startsWith('consent.'),
    });
    return res.url;
  } catch {
    return url;
  }
}

type Place = { name: string | null; address: string | null; phone: string | null; website: string | null };

/** Google Places (opcional): telefone, site e morada do negócio. */
export async function lookupPlace(query: string): Promise<Place | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch(process.env.GOOGLE_PLACES_ENDPOINT || PLACES_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'pt-PT', regionCode: 'PT', pageSize: 1 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      places?: { displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; internationalPhoneNumber?: string; websiteUri?: string }[];
    };
    const p = json.places?.[0];
    if (!p) return null;
    return {
      name: p.displayName?.text ?? null,
      address: p.formattedAddress ?? null,
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
    };
  } catch {
    return null;
  }
}

/** Nome, telefone e email a partir do site. */
async function readWebsite(url: string): Promise<{ title: string | null; phone: string | null; email: string | null } | null> {
  try {
    const page = await safeGet(url, { timeoutMs: 10_000, maxBytes: 1_500_000 });
    if (page.status >= 400) return null;
    const found = pageContacts(page.body);
    return { title: found.title, phone: found.phones[0] ?? null, email: found.emails[0] ?? null };
  } catch {
    return null;
  }
}

export async function parseSharedLead(payload: SharePayload): Promise<SharedLeadDraft> {
  const { urls, lines } = splitShared(payload);
  const draft: SharedLeadDraft = {
    company_name: null,
    website: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    source_url: null,
    channel: null,
    found: [],
  };
  const note = (what: string) => {
    if (!draft.found.includes(what)) draft.found.push(what);
  };

  const maps = urls.find((u) => shareLinkKind(u) === 'maps') ?? null;
  const social = urls.find((u) => shareLinkKind(u) === 'instagram' || shareLinkKind(u) === 'facebook') ?? null;
  const website = urls.find((u) => shareLinkKind(u) === 'website') ?? null;
  const textLines = lines.filter((l) => !/^(veja|see|check out|olha)\b/i.test(l) || /\(@/.test(l));

  // Texto partilhado pelo Maps: "Nome\nMorada\n<link>".
  const address = textLines.find(looksLikeAddress) ?? null;
  if (address) draft.address = address;

  if (maps) {
    draft.source_url = maps;
    draft.channel = 'google_maps';
    const place = parseMapsPlaceUrl(await resolveMapsLink(maps));
    draft.company_name = place.name?.split(',')[0]?.trim() || textLines.find((l) => l !== address) || null;
    if (draft.company_name) note('Google Maps');
  }
  if (social) {
    const kind = shareLinkKind(social) as 'instagram' | 'facebook';
    if (kind === 'instagram') draft.channel ??= 'instagram';
    draft.source_url ??= social;
    const handle = socialHandle(social);
    draft.company_name ??= nameFromSocialText(lines) ?? (handle ? prettifyHandle(handle) : null);
    if (draft.company_name) note(kind === 'instagram' ? 'Instagram' : 'Facebook');
  }
  if (!draft.company_name) draft.company_name = textLines.find((l) => l !== address && l.length <= 120) ?? null;

  // Google Places (opcional): telefone, site e morada.
  if (maps || (draft.company_name && address)) {
    const place = await lookupPlace([draft.company_name, draft.address].filter(Boolean).join(', '));
    if (place) {
      draft.company_name = draft.company_name ?? place.name;
      draft.address = place.address ?? draft.address;
      draft.phone = place.phone ? formatSharedPhone(place.phone) : null;
      draft.website = place.website;
      note('Google (telefone e site)');
    }
  }

  draft.website ??= website;
  if (draft.website && (!draft.phone || !draft.email || !draft.company_name)) {
    const site = await readWebsite(draft.website);
    if (site) {
      draft.company_name ??= site.title;
      draft.phone ??= site.phone ? formatSharedPhone(site.phone) : null;
      draft.email ??= site.email;
      note('site da empresa');
    }
  }
  draft.city = cityFromAddress(draft.address);
  if (draft.company_name) draft.company_name = draft.company_name.slice(0, 200);
  return draft;
}
