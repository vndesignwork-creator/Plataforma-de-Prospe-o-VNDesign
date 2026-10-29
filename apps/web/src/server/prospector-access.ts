/**
 * Equipa de prospeção: o que um prospetor pode usar na API. Só a parte
 * comercial (leads, prospeção, gerador, Kanban, mapa, scripts, contactar);
 * projetos, pagamentos, propostas, contratos, horas, definições, importar,
 * exportar e apagar ficam de fora (403). As tabelas sensíveis também estão
 * fechadas no RLS (is_workspace_staff), por isso isto é a segunda barreira.
 */
type Rule = [methods: string, path: RegExp];

// Só ids (uuid): assim /leads/export ou /lead-generation/schedules não passam por /leads/{id}.
const ID = '[0-9a-fA-F-]{36}';
const RULES: Rule[] = [
  ['GET', /^\/me$/],
  ['GET', /^\/me\/sessions$/],
  ['GET PATCH', /^\/me\/profile$/],
  ['GET', /^\/email-check$/],
  ['GET', /^\/replies$/],
  ['POST', new RegExp(`^/leads/${ID}/replies/handled$`)],
  ['POST DELETE', /^\/me\/avatar$/],
  ['GET', new RegExp(`^/avatars/${ID}$`)],
  ['DELETE', new RegExp(`^/me/sessions/${ID}$`)],
  ['GET', /^\/meta$/],
  ['GET', /^\/settings$/],
  ['GET', /^\/mail-account$/],
  ['GET', /^\/board$/],
  ['GET', /^\/dashboard\/today$/],
  ['GET POST', /^\/do-not-contact$/],
  ['GET POST', /^\/lead-generation$/],
  ['GET', new RegExp(`^/lead-generation/${ID}$`)],
  ['POST', new RegExp(`^/lead-generation/${ID}/add$`)],
  ['GET POST', /^\/leads$/],
  ['POST', /^\/leads\/(check-duplicates|bulk|card-scan|from-text)$/],
  ['GET', /^\/custom-fields$/],
  ['GET', /^\/leads\/(tags|cities)$/],
  ['GET PATCH', new RegExp(`^/leads/${ID}$`)],
  ['GET POST', new RegExp(`^/leads/${ID}/(activities|ai-visibility|audits|meetings|tasks)$`)],
  ['POST', new RegExp(`^/leads/${ID}/comments$`)],
  ['DELETE', new RegExp(`^/leads/${ID}/activities/${ID}$`)],
  ['POST', new RegExp(`^/leads/${ID}/audits/${ID}/apply$`)],
  ['GET', new RegExp(`^/leads/${ID}/audits/${ID}/screenshots/${ID}$`)],
  ['GET', new RegExp(`^/leads/${ID}/(diagnosis-pdf|email-tracking|follow-up-draft)$`)],
  ['POST', new RegExp(`^/leads/${ID}/(ai-email|email|find-contacts|follow-up|location|meeting-notes|move|prospecting|render-template|screenshots|summary)$`)],
  ['POST', new RegExp(`^/leads/${ID}/tasks/(reorder|template)$`)],
  ['GET PATCH', new RegExp(`^/leads/${ID}/geo$`)],
  // Ficheiros do lead (fotos do espaço, menu…): na prospeção também.
  ['GET', new RegExp(`^/leads/${ID}/brand-kit$`)],
  ['POST', new RegExp(`^/leads/${ID}/brand-kit/files$`)],
  ['GET DELETE', new RegExp(`^/leads/${ID}/brand-kit/files/\\d+$`)],
  ['POST', new RegExp(`^/leads/${ID}/geo/(faq|google)$`)],
  ['GET', /^\/map$/],
  ['POST', /^\/map\/geocode$/],
  ['POST', new RegExp(`^/meetings/${ID}/cancel$`)],
  ['GET', new RegExp(`^/meetings/${ID}/ics$`)],
  ['GET PUT', /^\/preferences\/[^/]+$/],
  ['GET', /^\/prospecting$/],
  ['GET POST DELETE', /^\/push-subscriptions$/],
  ['POST', /^\/push-subscriptions\/test$/],
  ['GET', /^\/(sectors|services|service-categories|task-templates|templates)$/],
  ['GET', new RegExp(`^/templates/${ID}$`)],
  ['POST', /^\/share$/],
  ['GET PUT', /^\/signature$/],
  ['GET', /^\/tasks$/],
  ['PATCH DELETE', new RegExp(`^/tasks/${ID}$`)],
  ['GET', /^\/notifications$/],
  ['POST', /^\/notifications\/read$/],
  ['DELETE', /^\/notifications$/],
  ['DELETE', new RegExp(`^/notifications/${ID}$`)],
  ['POST', /^\/reschedule$/],
  ['GET', /^\/stats\/team$/],
  ['GET', /^\/team\/names$/],
];

/** O prospetor pode fazer este pedido? (`path` sem o prefixo /api/v1). */
export function prospectorAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  return RULES.some(([methods, re]) => methods.split(' ').includes(m) && re.test(path));
}

/** Campos com valores que o prospetor não vê (em qualquer resposta). */
const HIDDEN_KEYS = new Set(['estimated_value']);

export function scrubForProspector(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubForProspector);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !HIDDEN_KEYS.has(k))
        .map(([k, v]) => [k, scrubForProspector(v)]),
    );
  }
  return value;
}
