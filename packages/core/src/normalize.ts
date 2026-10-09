/**
 * Normalização usada na deteção de duplicados.
 *
 * ATENÇÃO: a fonte de verdade é o SQL (supabase/migrations/*_base.sql:
 * vnd_normalize_company, vnd_website_key, vnd_normalize_email). Estas funções
 * são o espelho em TypeScript — usadas para comparar linhas dentro do mesmo
 * ficheiro de importação e na interface. Se mudares uma, muda a outra.
 */

/** Letras que o NFD não decompõe, convertidas como faz o unaccent do Postgres. */
const FOLD: Record<string, string> = {
  ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ß: 'ss', ẞ: 'SS',
  đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', ł: 'l', Ł: 'L', þ: 'th', Þ: 'TH',
  ĳ: 'ij', Ĳ: 'IJ', ﬁ: 'fi', ﬂ: 'fl',
};
const FOLD_RE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g');

/** Remove acentos/diacríticos ("Saúde" → "Saude", "Ørsted" → "Orsted"). */
export function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(FOLD_RE, (c) => FOLD[c] ?? c);
}

/** Minúsculas, sem acentos e com espaços colapsados. Devolve null se vazio. */
export function normalizeText(value: string | null | undefined): string | null {
  const s = stripAccents((value ?? '').toLowerCase()).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

const LEGAL_SUFFIX = /\s+(lda|ltda|limitada|unipessoal|sa|crl|sgps|ltd)$/;
/** Pontuação ASCII, travessões, aspas tipográficas e espaços (as letras acentuadas ficam). */
const PUNCTUATION = /[!-/:-@[-`{-~–—‘’“”«»·•…\s]+/g;

/**
 * Nome de empresa normalizado:
 * "KUBRATECH, UNIPESSOAL, LDA" → "kubratech"; "MOBILITY 24, S.A." → "mobility 24".
 * A forma jurídica é retirada ANTES de tirar os acentos, para que
 * "Clínica Sá" não perca o "Sá" (≠ "SA").
 */
export function normalizeCompanyName(value: string | null | undefined): string | null {
  let s = (value ?? '').toLowerCase().replace(/\./g, '').replace(PUNCTUATION, ' ').trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(LEGAL_SUFFIX, '');
  } while (s !== prev);
  s = stripAccents(s).replace(/[^a-z0-9]+/g, ' ').trim();
  return s === '' ? null : s;
}

/** Plataformas onde o domínio não identifica a empresa: a chave inclui o caminho. */
const PATH_PLATFORMS =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|linktr\.ee|restaurantguru\.com|sluurpy\.com|wanderlog\.com|tripadvisor\.[a-z.]+|thefork\.[a-z.]+|zomato\.com|google\.[a-z.]+|goo\.gl|wixsite\.com)$/;

/**
 * Chave do website para comparar leads:
 * "https://www.ecs.com.pt/" → "ecs.com.pt";
 * "https://m.facebook.com/bogotacervejaria/" → "facebook.com/bogotacervejaria".
 */
export function websiteKey(value: string | null | undefined): string | null {
  let s = (value ?? '').trim().toLowerCase();
  if (s === '' || /^-+$/.test(s)) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/[?#].*$/, '');
  let host = s.split('/')[0] ?? '';
  const path = s.slice(host.length + 1).replace(/\/+$/, '');
  host = host
    .replace(/^.*@/, '')
    .replace(/:[0-9]+$/, '')
    .replace(/\.$/, '')
    .replace(/^(www[0-9]?|m|mobile)\./, '');
  if (host === '' || !host.includes('.')) return null;
  if (PATH_PLATFORMS.test(host)) {
    return path === '' ? null : `${host}/${path}`;
  }
  return host;
}

const EMAIL_IN_TEXT = /[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/;

/** Primeiro email válido encontrado no texto, em minúsculas. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const match = (value ?? '').match(EMAIL_IN_TEXT);
  return match ? match[0].toLowerCase() : null;
}

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.pt', 'outlook.com', 'outlook.pt',
  'live.com', 'live.com.pt', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'yahoo.pt', 'icloud.com',
  'me.com', 'sapo.pt', 'netcabo.pt', 'clix.pt', 'iol.pt', 'mail.pt', 'aeiou.pt', 'gmx.com',
  'gmx.net', 'protonmail.com', 'proton.me', 'vodafone.pt', 'meo.pt', 'nos.pt',
]);

/** Domínio empresarial do email (null para gmail, hotmail, sapo…). */
export function emailBusinessDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const domain = normalized.split('@')[1] ?? '';
  return GENERIC_EMAIL_DOMAINS.has(domain) ? null : domain;
}

/** "Educação & Formação" → "educacao-formacao" */
export function slugify(value: string): string {
  return stripAccents(value.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Garante protocolo num URL escrito à mão ("vndesign.pt" → "https://vndesign.pt"). */
export function ensureUrlProtocol(value: string): string {
  const s = value.trim();
  if (s === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/** Os "--" e vazios da folha contam como sem valor. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const s = value.trim();
  return s === '' || /^-+$/.test(s);
}
