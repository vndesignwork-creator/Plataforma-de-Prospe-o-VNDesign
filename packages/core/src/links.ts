/**
 * Links que não são o site da empresa: diretórios/agregadores (TripAdvisor,
 * Sluurpy, Google Maps…) e redes sociais. Um diretório no campo "Website" é um
 * erro de dados — o link pertence ao campo "Fonte".
 * A mesma lista existe em SQL (vnd_is_directory_url) para corrigir dados antigos.
 */
import { ensureUrlProtocol, websiteKey } from './normalize';

/** Diretórios e agregadores: listam o negócio, mas não são o site dele. */
export const DIRECTORY_HOSTS =
  /(^|\.)(sluurpy\.[a-z.]+|restaurantguru\.[a-z.]+|wanderlog\.com|tripadvisor\.[a-z.]+|thefork\.[a-z.]+|zomato\.com|yelp\.[a-z.]+|paginasamarelas\.pt|zaask\.pt|fixando\.pt|guiadacidade\.pt|booking\.com|maps\.app\.goo\.gl|goo\.gl|google\.[a-z.]+)$/;

/** Redes sociais: a página da empresa, mas não um site próprio. */
export const SOCIAL_HOSTS =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|linktr\.ee|business\.site)$/;

function host(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  try {
    return new URL(ensureUrlProtocol(raw)).hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  } catch {
    return null;
  }
}

export function isDirectoryUrl(url: string | null | undefined): boolean {
  const h = host(url);
  return h !== null && DIRECTORY_HOSTS.test(h);
}

export function isSocialUrl(url: string | null | undefined): boolean {
  const h = host(url);
  return h !== null && SOCIAL_HOSTS.test(h);
}

/** O endereço é de uma rede social ou diretório (e não um site próprio)? */
export function isSocialOrDirectoryUrl(url: string | null | undefined): boolean {
  return isDirectoryUrl(url) || isSocialUrl(url);
}

export interface LeadLinks {
  website?: string | null;
  source_url?: string | null;
  notes?: string | null;
}

/**
 * Se o "Website" for um diretório, passa-o para "Fonte" (ou, se a Fonte já tiver
 * outro link, para as notas) e limpa o Website. Devolve só os campos alterados.
 */
export function fixDirectoryWebsite(lead: LeadLinks): Partial<LeadLinks> | null {
  const website = lead.website?.trim();
  if (!website || !isDirectoryUrl(website)) return null;
  const source = lead.source_url?.trim();
  if (!source) return { website: null, source_url: website };
  if (websiteKey(source) === websiteKey(website) || source === website) return { website: null };
  const line = `Link de diretório: ${website}`;
  const notes = lead.notes?.includes(website) ? lead.notes : [lead.notes?.trim(), line].filter(Boolean).join('\n');
  return { website: null, notes };
}
