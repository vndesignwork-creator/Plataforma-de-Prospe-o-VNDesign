/**
 * Etiquetas automáticas a partir da análise do site: logo a seguir à análise, o
 * lead fica com etiquetas como "site muito lento" ou "sem telemóvel". Depois
 * filtram-se nos Leads e fazem-se campanhas certeiras (ex.: falar só com quem
 * não tem o site tratado para telemóvel).
 *
 * Sai dos problemas que a análise já encontrou (não precisa de IA, é imediato
 * e não gasta nada).
 */
import type { AuditIssueCode } from './audit';

export const AUTO_TAG_MAX = 4;

/** Etiqueta de cada problema da análise (a ordem manda: as primeiras entram primeiro). */
export const AUDIT_TAG_RULES: { codes: readonly AuditIssueCode[]; tag: string; unless?: readonly AuditIssueCode[] }[] = [
  { codes: ['no_own_site'], tag: 'sem site' },
  { codes: ['unreachable', 'http_error'], tag: 'site em baixo' },
  { codes: ['no_https', 'ssl_invalid'], tag: 'site inseguro' },
  { codes: ['no_viewport', 'zoom_blocked'], tag: 'sem telemóvel' },
  { codes: ['pagespeed_low'], tag: 'site muito lento' },
  // "Lento" só quando não é já "muito lento" (senão ficavam as duas).
  { codes: ['pagespeed_medium', 'slow_lcp', 'slow_response'], tag: 'site lento', unless: ['pagespeed_low'] },
  { codes: ['outdated_copyright'], tag: 'site desatualizado' },
  { codes: ['no_contact_info'], tag: 'sem contactos no site' },
  { codes: ['no_title', 'no_meta_description'], tag: 'fraco no Google' },
  { codes: ['ai_bots_blocked', 'no_structured_data', 'thin_content'], tag: 'fraco nas IAs' },
];

/** Todas as etiquetas que a análise pode pôr (para a ajuda e para os filtros). */
export const AUTO_TAGS = AUDIT_TAG_RULES.map((r) => r.tag);

/**
 * As etiquetas desta análise: no máximo `AUTO_TAG_MAX`, pela ordem das regras
 * ("site muito lento" ganha a "site lento": nunca entram as duas).
 */
export function auditTags(issues: readonly { code: AuditIssueCode }[], max = AUTO_TAG_MAX): string[] {
  const codes = new Set(issues.map((i) => i.code));
  const tags: string[] = [];
  for (const rule of AUDIT_TAG_RULES) {
    if (tags.length >= max) break;
    if (rule.unless?.some((c) => codes.has(c))) continue;
    if (rule.codes.some((c) => codes.has(c))) tags.push(rule.tag);
  }
  return tags;
}

/**
 * As etiquetas do lead depois da análise: junta as novas às que já lá estavam
 * (sem repetir e sem passar do limite), e tira as automáticas que já não se
 * aplicam (o site foi arranjado).
 */
export function mergeAuditTags(current: readonly string[], fresh: readonly string[], max = 10): string[] {
  const auto = new Set(AUTO_TAGS);
  const kept = current.filter((t) => !auto.has(t.toLowerCase()));
  const out = [...kept];
  for (const tag of fresh) {
    if (out.length >= max) break;
    if (!out.some((t) => t.toLowerCase() === tag)) out.push(tag);
  }
  return out.slice(0, max);
}
