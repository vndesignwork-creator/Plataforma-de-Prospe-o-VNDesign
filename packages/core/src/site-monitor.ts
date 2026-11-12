/**
 * Vigiar o site do cliente: está no ar (verificado de hora a hora; 2 falhas seguidas =
 * em baixo), quando expira o certificado SSL e quando expira o domínio (consulta pública
 * RDAP ou escrito à mão). Avisa antes e cria uma tarefa.
 */
import { z } from 'zod';
import { addDays, daysBetween } from './format';

/** Avisar o certificado SSL com esta antecedência (dias). */
export const SSL_WARN_DAYS = 14;
/** Avisar o domínio com esta antecedência (dias). */
export const DOMAIN_WARN_DAYS = 30;
/** Falhas seguidas para contar como em baixo. */
export const DOWN_AFTER_FAILS = 2;
/** "Falso alarme": durante quantos dias as falhas do site não o dão como em baixo. */
export const FALSE_ALARM_DAYS = 7;

/** O "em baixo" deste site está silenciado (falso alarme) neste momento? */
export function downMuted(m: { down_muted_until?: string | null }, now: Date = new Date()): boolean {
  return !!m.down_muted_until && new Date(m.down_muted_until).getTime() > now.getTime();
}

export const SiteMonitorSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    url: z.string(),
    active: z.boolean(),
    checked_at: z.string().nullable(),
    next_check_at: z.string(),
    is_up: z.boolean().nullable().meta({ description: 'null = ainda não verificado' }),
    status_code: z.int().nullable(),
    response_ms: z.int().nullable(),
    error: z.string().nullable(),
    fail_count: z.int(),
    down_since: z.string().nullable().meta({ description: 'Em baixo desde (2 falhas seguidas)' }),
    ssl_expires_at: z.string().nullable(),
    ssl_error: z.string().nullable(),
    domain_expires_on: z.string().nullable(),
    domain_source: z.enum(['rdap', 'manual']).nullable(),
    domain_checked_at: z.string().nullable(),
    down_muted_until: z.string().nullable().optional().meta({ description: 'Falso alarme: até esta data, as falhas não contam como "em baixo"' }),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'SiteMonitor' });
export type SiteMonitor = z.infer<typeof SiteMonitorSchema>;

const url = z
  .string({ error: 'Indica o endereço do site.' })
  .trim()
  .min(4, { error: 'Indica o endereço do site.' })
  .max(500)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.url({ protocol: /^https?$/, error: 'Endereço inválido (ex.: https://cliente.pt).' }));

export const SiteMonitorCreateSchema = z
  .object({ url: url.optional().meta({ description: 'Vazio = o site do lead' }) })
  .meta({ id: 'SiteMonitorCreate' });

export const SiteMonitorUpdateSchema = z
  .object({
    url: url.optional(),
    active: z.boolean().optional(),
    domain_expires_on: z.iso
      .date({ error: 'Data inválida.' })
      .nullable()
      .optional()
      .meta({ description: 'Escrever à mão quando a consulta pública não dá a data (null = voltar a consultar)' }),
    false_alarm: z
      .boolean()
      .optional()
      .meta({
        description: `true = "Falso alarme": o site está no ar; tira o "em baixo" e, durante ${FALSE_ALARM_DAYS} dias, as falhas não o voltam a dar como em baixo. false = voltar a avisar já.`,
      }),
  })
  .meta({ id: 'SiteMonitorUpdate' });
export type SiteMonitorUpdate = z.infer<typeof SiteMonitorUpdateSchema>;

/** Site do cliente na lista (Projetos/Dashboard): com o lead. */
export const SiteMonitorListItemSchema = SiteMonitorSchema.extend({
  lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), status: z.string().optional().meta({ description: 'Estado do lead (cliente ou lead quente)' }) }),
  domain_renewal_on: z.string().nullable().optional().meta({ description: 'Renovação do domínio registada (Renovações e avenças)' }),
}).meta({ id: 'SiteMonitorListItem' });
export type SiteMonitorListItem = z.infer<typeof SiteMonitorListItemSchema>;

export type SiteIssueKind = 'down' | 'ssl_expired' | 'ssl_soon' | 'ssl_error' | 'domain_expired' | 'domain_soon';
export interface SiteIssue {
  kind: SiteIssueKind;
  severity: 'danger' | 'warning';
  label: string;
  /** A data relevante (dia de expiração) ou o "desde" (em baixo). */
  date: string | null;
}

/** Os problemas de um site hoje (para avisos, cartão e Dashboard). */
export function siteIssues(
  m: Pick<SiteMonitor, 'is_up' | 'down_since' | 'ssl_expires_at' | 'ssl_error' | 'domain_expires_on' | 'url' | 'error'>,
  today: string,
  domainDate: string | null = m.domain_expires_on,
): SiteIssue[] {
  const issues: SiteIssue[] = [];
  if (m.down_since) issues.push({ kind: 'down', severity: 'danger', label: `Em baixo${m.error ? ` (${m.error})` : ''}`, date: m.down_since });
  if (m.ssl_expires_at) {
    const day = m.ssl_expires_at.slice(0, 10);
    const left = daysBetween(today, day);
    if (left < 0) issues.push({ kind: 'ssl_expired', severity: 'danger', label: 'Certificado SSL expirado', date: day });
    else if (left <= SSL_WARN_DAYS) issues.push({ kind: 'ssl_soon', severity: 'warning', label: `Certificado SSL expira ${left === 0 ? 'hoje' : `em ${left} dia${left === 1 ? '' : 's'}`}`, date: day });
  }
  // Certificado inválido (ex.: não corresponde ao domínio); o expirado já está acima.
  if (m.ssl_error && /^https:/i.test(m.url) && !issues.some((i) => i.kind === 'ssl_expired')) {
    issues.push({ kind: 'ssl_error', severity: 'warning', label: m.ssl_error, date: null });
  }
  if (domainDate) {
    const left = daysBetween(today, domainDate);
    if (left < 0) issues.push({ kind: 'domain_expired', severity: 'danger', label: 'Domínio expirado', date: domainDate });
    else if (left <= DOMAIN_WARN_DAYS) issues.push({ kind: 'domain_soon', severity: 'warning', label: `Domínio expira ${left === 0 ? 'hoje' : `em ${left} dia${left === 1 ? '' : 's'}`}`, date: domainDate });
  }
  return issues;
}

/** O domínio registável de um endereço (o que se renova): "www.loja.cliente.pt" → "cliente.pt". */
export function registrableDomain(input: string): string | null {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split('.');
  // Sufixos de segundo nível comuns (com.pt, co.uk, com.br…): o domínio tem 3 partes.
  const SECOND_LEVEL = new Set(['com', 'org', 'net', 'gov', 'edu', 'co', 'ac', 'nome', 'publ']);
  const n = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]!) && parts[parts.length - 1]!.length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

/** Data de expiração numa resposta RDAP (events: eventAction "expiration"). */
export function rdapExpiry(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const { eventAction, eventDate } = e as { eventAction?: unknown; eventDate?: unknown };
    if (typeof eventAction === 'string' && /expir/i.test(eventAction) && typeof eventDate === 'string') {
      const d = new Date(eventDate);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

/** Endereço RDAP para o domínio, a partir do ficheiro público da IANA (dns.json). */
export function rdapBaseFor(domain: string, bootstrap: unknown): string | null {
  const tld = domain.split('.').pop()?.toLowerCase();
  if (!tld || !bootstrap || typeof bootstrap !== 'object') return null;
  const services = (bootstrap as { services?: unknown }).services;
  if (!Array.isArray(services)) return null;
  for (const s of services) {
    if (!Array.isArray(s) || !Array.isArray(s[0]) || !Array.isArray(s[1])) continue;
    if ((s[0] as unknown[]).some((t) => typeof t === 'string' && t.toLowerCase() === tld)) {
      const base = (s[1] as unknown[]).find((u): u is string => typeof u === 'string' && u.startsWith('https://'));
      if (base) return base.endsWith('/') ? base : `${base}/`;
    }
  }
  return null;
}

/** Próxima verificação: 1 hora depois (leads: 6 horas), ou 5 minutos depois de uma falha, para confirmar. */
export function nextCheckAt(now: Date, failed: boolean, everyMinutes = 60): string {
  return new Date(now.getTime() + (failed ? 5 : everyMinutes) * 60_000).toISOString();
}

// -----------------------------------------------------------------------------
// Oportunidades: o site de um lead quente com problemas (bom momento para contactar)
// -----------------------------------------------------------------------------
/** Quantos leads quentes (os de maior pontuação, com site) se vigiam sozinhos. */
export const PROSPECT_WATCH_COUNT = 20;
/** De quanto em quanto tempo se vê o site de um lead (minutos). */
export const PROSPECT_CHECK_MINUTES = 360;
/** Primeira resposta acima disto (ms) = muito lento. */
export const SLOW_RESPONSE_MS = 5000;

export type OpportunityKind = 'down' | 'ssl' | 'slow';
export interface Opportunity {
  kind: OpportunityKind;
  label: string;
}

/** O problema do site de um lead que vale um contacto (ou null). */
export function siteOpportunity(
  m: Pick<SiteMonitor, 'is_up' | 'down_since' | 'ssl_expires_at' | 'ssl_error' | 'response_ms' | 'url' | 'fail_count' | 'active'>,
  today: string,
): Opportunity | null {
  if (!m.active) return null;
  if (m.down_since) return { kind: 'down', label: 'O site está em baixo' };
  const sslDay = m.ssl_expires_at?.slice(0, 10) ?? null;
  if (sslDay && daysBetween(today, sslDay) < 0) return { kind: 'ssl', label: 'O certificado do site expirou ("Não seguro")' };
  if (/^https:/i.test(m.url) && m.ssl_error) return { kind: 'ssl', label: `O site aparece como "Não seguro" (${m.ssl_error.replace(/\.$/, '')})` };
  if (sslDay && daysBetween(today, sslDay) <= 7) return { kind: 'ssl', label: 'O certificado do site expira esta semana' };
  if (m.is_up && m.fail_count === 0 && (m.response_ms ?? 0) >= SLOW_RESPONSE_MS) {
    return { kind: 'slow', label: `O site demora ${Math.round((m.response_ms ?? 0) / 1000)} s a responder` };
  }
  return null;
}

/** Mensagem pronta para contactar o lead por causa do problema do site. */
export function opportunityMessage(
  kind: OpportunityKind,
  lead: { company_name: string; contact_name?: string | null },
  host: string,
): { subject: string; body: string } {
  const first = lead.contact_name?.trim().split(/\s+/)[0];
  const hello = first ? `Olá ${first},` : 'Olá,';
  const company = lead.company_name;
  const what: Record<OpportunityKind, { subject: string; text: string }> = {
    down: {
      subject: `O site da ${company} está em baixo`,
      text: `Tentei abrir o site da ${company} (${host}) e não está a abrir neste momento. Não sei se já sabem: quem procura a ${company} na internet não está a conseguir ver nada.`,
    },
    ssl: {
      subject: `O site da ${company} aparece como "Não seguro"`,
      text: `Reparei que o site da ${company} (${host}) aparece como "Não seguro" no browser. Muita gente desiste quando vê esse aviso, sobretudo no telemóvel.`,
    },
    slow: {
      subject: `O site da ${company} está muito lento`,
      text: `Reparei que o site da ${company} (${host}) está a demorar muito a abrir. No telemóvel, a maioria das pessoas desiste se o site não abrir em poucos segundos.`,
    },
  };
  return {
    subject: what[kind].subject,
    body: `${hello}\n\n${what[kind].text}\n\nSe quiserem, posso ajudar a resolver isto rapidamente (ou a fazer um site novo e mais rápido). Querem que vos diga o que é preciso?\n\nCumprimentos,`,
  };
}

/** Consultar o domínio outra vez? (de 7 em 7 dias; todos os dias no último mês). */
export function domainLookupDue(m: Pick<SiteMonitor, 'domain_checked_at' | 'domain_expires_on' | 'domain_source'>, today: string): boolean {
  if (m.domain_source === 'manual') return false;
  if (!m.domain_checked_at) return true;
  const last = m.domain_checked_at.slice(0, 10);
  const soon = m.domain_expires_on ? daysBetween(today, m.domain_expires_on) <= DOMAIN_WARN_DAYS : false;
  return last <= addDays(today, soon ? -1 : -7);
}
