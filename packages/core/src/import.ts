/**
 * Importação de folhas (CSV/XLSX): deteção da linha de cabeçalho, sugestão de
 * mapeamento de colunas e conversão de cada linha num lead válido.
 * Funções puras — usadas pela API (pré-visualização) e testadas com Vitest.
 */
import { LeadCreateSchema, type LeadCreate } from './schemas';
import {
  emailBusinessDomain,
  isBlank,
  normalizeCompanyName,
  normalizeEmail,
  slugify,
  websiteKey,
} from './normalize';
import {
  matchSector,
  parseChannel,
  parseEuroAmount,
  parseMobile,
  parsePageSpeed,
  parsePtDate,
  parseStatus,
  parseText,
  stripEmoji,
} from './parse';

export const IMPORT_FIELDS = [
  'number',
  'company_name',
  'sector',
  'website',
  'city',
  'address',
  'problems',
  'pagespeed',
  'mobile',
  'email',
  'phone',
  'contact_name',
  'status',
  'channel',
  'first_contact_on',
  'last_follow_up_on',
  'next_action',
  'next_action_on',
  'estimated_value',
  'notes',
  'approach_angle',
  'source_url',
  'suggested_on',
  'email_subject',
  'email_body',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportTarget = ImportField | 'ignore';

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  number: '# (número)',
  company_name: 'Empresa',
  sector: 'Setor',
  website: 'Website',
  city: 'Cidade',
  address: 'Morada',
  problems: 'Problemas',
  pagespeed: 'PageSpeed',
  mobile: 'Mobile?',
  email: 'Email',
  phone: 'Telefone',
  contact_name: 'Contacto',
  status: 'Estado',
  channel: 'Canal',
  first_contact_on: '1.º contacto',
  last_follow_up_on: 'Último follow-up',
  next_action: 'Próxima ação (texto e/ou data)',
  next_action_on: 'Data da próxima ação',
  estimated_value: 'Valor estimado (€)',
  notes: 'Notas',
  approach_angle: 'Ângulo de abordagem',
  source_url: 'Fonte',
  suggested_on: 'Sugerido em',
  email_subject: 'Assunto do email',
  email_body: 'Email de prospeção',
};

/** Nomes de coluna reconhecidos (já em forma "slug": sem acentos/emoji/pontuação). */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  number: ['n', 'no', 'num', 'numero', 'id'],
  company_name: ['empresa', 'nome', 'nome-da-empresa', 'company', 'company-name', 'negocio', 'cliente'],
  sector: ['setor', 'sector', 'setores', 'sectores', 'categoria', 'area'],
  website: ['website', 'site', 'url', 'web', 'pagina', 'site-web'],
  city: ['cidade', 'localidade', 'concelho', 'city', 'localizacao', 'local'],
  address: ['morada', 'endereco', 'address', 'morada-comercial'],
  problems: ['problemas', 'problema', 'problems', 'diagnostico'],
  pagespeed: ['pagespeed', 'page-speed', 'pagespeed-mobile', 'velocidade'],
  mobile: ['mobile', 'responsivo', 'mobile-friendly', 'adaptado-a-telemovel'],
  email: ['email', 'e-mail', 'mail', 'correio-eletronico'],
  phone: ['telefone', 'telemovel', 'tel', 'phone', 'contacto-telefonico'],
  contact_name: ['contacto', 'pessoa-de-contacto', 'contact', 'responsavel', 'nome-do-contacto'],
  status: ['estado', 'status', 'fase', 'etapa'],
  channel: ['canal', 'channel', 'canal-de-contacto'],
  first_contact_on: ['1-contacto', '1o-contacto', 'primeiro-contacto', 'first-contact', 'data-1-contacto'],
  last_follow_up_on: ['ultimo-follow-up', 'ultimo-followup', 'follow-up', 'last-follow-up'],
  next_action: ['prox-acao', 'proxima-acao', 'next-action', 'acao'],
  next_action_on: ['data-da-proxima-acao', 'data-proxima-acao', 'next-action-date'],
  estimated_value: ['valor-est', 'valor-estimado', 'valor', 'valor-eur', 'value', 'orcamento'],
  notes: ['notas', 'nota', 'observacoes', 'obs', 'notes'],
  approach_angle: ['angulo-de-abordagem', 'angulo', 'abordagem'],
  source_url: ['fonte', 'origem', 'source', 'origem-dos-dados'],
  suggested_on: ['sugerido-em', 'data-sugestao', 'adicionado-em', 'data'],
  email_subject: ['assunto-do-email', 'assunto'],
  email_body: ['email-de-prospecao', 'email-de-prospeccao', 'corpo-do-email', 'mensagem', 'texto-do-email'],
};

const ALIAS_INDEX = new Map<string, ImportField>();
for (const field of IMPORT_FIELDS) {
  for (const alias of HEADER_ALIASES[field]) ALIAS_INDEX.set(alias, field);
}

/** Campo sugerido para um cabeçalho ("📧 Email" → email; "#" → number). */
export function suggestField(header: string | null | undefined): ImportField | null {
  const raw = (header ?? '').trim();
  if (raw === '#' || raw === 'Nº' || raw === 'N.º') return 'number';
  const key = slugify(stripEmoji(raw));
  return key ? (ALIAS_INDEX.get(key) ?? null) : null;
}

/** Mapeamento sugerido (cada campo só é usado uma vez — fica a primeira coluna). */
export function suggestMapping(headers: readonly string[]): ImportTarget[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const field = suggestField(h);
    if (!field || used.has(field)) return 'ignore';
    used.add(field);
    return field;
  });
}

/**
 * Linha de cabeçalho: a primeira, entre as 15 iniciais, com mais colunas
 * reconhecidas (mín. 2). A folha atual tem um título na linha 1 e o
 * cabeçalho na linha 2.
 */
export function detectHeaderRow(rows: readonly (readonly string[])[]): number {
  let best = 0;
  let bestScore = 0;
  rows.slice(0, 15).forEach((row, i) => {
    const score = new Set(row.map(suggestField).filter(Boolean)).size;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? best : 0;
}

/** "Ligar ao gerente 12/10/2026" → { text: "Ligar ao gerente", date: "2026-10-12" } */
export function parseNextAction(value: unknown): { text: string | null; date: string | null } {
  const raw = parseText(value);
  if (!raw) return { text: null, date: null };
  const direct = parsePtDate(raw);
  if (direct) return { text: null, date: direct };
  const match = raw.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/);
  const date = match ? parsePtDate(match[1]) : null;
  let text = date && match ? raw.replace(match[0], ' ') : raw;
  text = text
    .replace(/\(\s*\)/g, ' ')
    .replace(/\b(em|a|até|ate|dia|para)\s*$/i, ' ')
    .replace(/^[\s:–—-]+|[\s:–—,(-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: text || null, date };
}

export interface ImportSectorRef {
  id: string;
  name: string;
  slug: string;
}

export interface MappedRow {
  /** Dados prontos para LeadCreateSchema (já validados). */
  lead: LeadCreate;
  /** "#" da folha, se mapeado. */
  number: number | null;
  warnings: string[];
}

export type MapRowResult = { ok: true; value: MappedRow } | { ok: false; errors: string[]; warnings: string[] };

const TEXT_FIELDS = [
  'city', 'address', 'problems', 'phone', 'contact_name', 'notes', 'approach_angle', 'email_subject', 'email_body',
] as const;

/** A linha está toda vazia (ou só com "--")? */
export function isEmptyRow(row: readonly string[]): boolean {
  return row.every((c) => isBlank(c));
}

/**
 * Converte uma linha da folha num lead. Valores inválidos num campo opcional
 * geram um aviso e o campo fica vazio; sem nome de empresa a linha é inválida.
 */
export function mapImportRow(
  row: readonly string[],
  mapping: readonly ImportTarget[],
  sectors: readonly ImportSectorRef[],
): MapRowResult {
  const warnings: string[] = [];
  const lead: Record<string, unknown> = {};
  let number: number | null = null;
  const get = (field: ImportField): string | null => {
    const i = mapping.indexOf(field);
    return i >= 0 ? parseText(row[i]) : null;
  };
  const label = (f: ImportField) => IMPORT_FIELD_LABELS[f];

  const n = get('number');
  if (n && /^\d+$/.test(n)) number = Number(n);

  const company = get('company_name');
  if (!company) return { ok: false, errors: ['Falta o nome da empresa.'], warnings };
  lead.company_name = company.replace(/\s+/g, ' ');

  for (const f of TEXT_FIELDS) {
    const v = get(f);
    if (v !== null) lead[f] = v;
  }

  const sector = get('sector');
  if (sector) {
    const match = matchSector(sector, sectors);
    if (match) lead.sector_id = match.id;
    else warnings.push(`Setor "${stripEmoji(sector)}" não existe nas definições — fica sem setor.`);
  }

  for (const f of ['website', 'source_url'] as const) {
    const v = get(f);
    if (v) lead[f] = v;
  }

  const email = get('email');
  if (email) {
    const normalized = normalizeEmail(email);
    if (normalized) lead.email = normalized;
    else warnings.push(`Email "${email}" inválido — ignorado.`);
  }

  const pagespeed = get('pagespeed');
  if (pagespeed) {
    const ps = parsePageSpeed(pagespeed);
    if (ps !== null) lead.pagespeed = ps;
    else warnings.push(`PageSpeed "${pagespeed}" inválido — ignorado.`);
  }

  const mobile = get('mobile');
  if (mobile) lead.mobile = parseMobile(mobile);

  const status = get('status');
  if (status) {
    const s = parseStatus(status);
    if (s) lead.status = s;
    else warnings.push(`Estado "${status}" desconhecido — fica "Identificado".`);
  }

  const channel = get('channel');
  if (channel) {
    const c = parseChannel(channel);
    if (c) lead.channel = c;
    else warnings.push(`Canal "${channel}" desconhecido — ignorado.`);
  }

  for (const f of ['first_contact_on', 'last_follow_up_on', 'next_action_on', 'suggested_on'] as const) {
    const v = get(f);
    if (!v) continue;
    const d = parsePtDate(v);
    if (d) lead[f] = d;
    else warnings.push(`${label(f)}: data "${v}" inválida — ignorada.`);
  }

  const nextAction = get('next_action');
  if (nextAction) {
    const { text, date } = parseNextAction(nextAction);
    if (text) lead.next_action_text = text;
    if (date && !lead.next_action_on) lead.next_action_on = date;
  }

  const value = get('estimated_value');
  if (value) {
    const v = parseEuroAmount(value);
    if (v !== null) lead.estimated_value = v;
    else warnings.push(`Valor "${value}" inválido — ignorado.`);
  }

  // Validação final com o mesmo schema da API; campos opcionais inválidos saem.
  let parsed = LeadCreateSchema.safeParse(lead);
  for (let attempt = 0; !parsed.success && attempt < 5; attempt++) {
    const fields = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    if (fields.has('company_name')) {
      return { ok: false, errors: parsed.error.issues.map((i) => i.message), warnings };
    }
    for (const f of fields) {
      warnings.push(`${f === 'website' ? 'Website' : f === 'source_url' ? 'Fonte' : f}: "${String(lead[f])}" inválido — ignorado.`);
      delete lead[f];
    }
    parsed = LeadCreateSchema.safeParse(lead);
  }
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message), warnings };
  return { ok: true, value: { lead: parsed.data, number, warnings } };
}

/**
 * Duplicados dentro do próprio ficheiro: devolve, para cada linha, o índice da
 * primeira linha anterior com o mesmo nome normalizado, website ou email
 * (mesmas regras "fortes" do SQL), ou null.
 */
export function findBatchDuplicates(
  rows: readonly ({ company_name?: string | null; website?: string | null; email?: string | null } | null)[],
): (number | null)[] {
  const seen = new Map<string, number>();
  return rows.map((row, i) => {
    if (!row) return null;
    const name = normalizeCompanyName(row.company_name);
    const web = websiteKey(row.website);
    const email = normalizeEmail(row.email);
    const domain = emailBusinessDomain(row.email);
    const keys = [
      name && `n:${name}`,
      web && `w:${web}`,
      email && `e:${email}`,
      // domínio do email ↔ website (geral@ecs.com.pt ↔ www.ecs.com.pt)
      domain && `w:${domain}`,
    ].filter(Boolean) as string[];
    const previous = keys.map((k) => seen.get(k)).find((v) => v !== undefined);
    for (const k of keys) if (!seen.has(k)) seen.set(k, i);
    return previous ?? null;
  });
}
