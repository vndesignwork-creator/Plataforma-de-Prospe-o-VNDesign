/**
 * Modelos de contacto com variáveis ({{empresa}}, {{contacto}}, …).
 * Função pura: usada na pré-visualização (browser), na API e, mais tarde,
 * no gerador de emails com IA.
 *
 * Sintaxe:
 *   {{empresa}}            → valor da variável
 *   {{contacto|equipa}}    → "equipa" se a variável estiver vazia
 * Variáveis vazias sem alternativa desaparecem e a pontuação à volta é
 * arrumada ("Olá {{contacto}}," → "Olá,").
 */
import { addDays, formatDate } from './format';
import {
  DEFAULT_SERVICE_CATEGORIES,
  DEFAULT_SERVICES,
  leadServiceCategory,
  type ServiceCategoryInfo,
  type ServiceInfo,
} from './services';

export const TEMPLATE_VARIABLES = [
  { key: 'empresa', label: 'Nome da empresa' },
  { key: 'contacto', label: 'Pessoa de contacto' },
  { key: 'setor', label: 'Setor' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'problema', label: 'Problemas identificados' },
  { key: 'angulo', label: 'Ângulo de abordagem' },
  { key: 'website', label: 'Website do lead' },
  { key: 'argumentos', label: 'Argumentos de venda do setor' },
  { key: 'servicos', label: 'Serviços de interesse do lead (ex.: identidade visual e flyers)' },
  { key: 'categoria', label: 'Categoria dos serviços do lead (ex.: design gráfico)' },
  { key: 'beneficio', label: 'Frase de valor do serviço (Definições → Serviços)' },
  { key: 'data', label: 'Data do 1.º contacto (ou hoje)' },
  { key: 'hoje', label: 'Data de hoje' },
  { key: 'meu_nome', label: 'O teu nome' },
  { key: 'meu_cargo', label: 'O teu cargo' },
  { key: 'meu_telefone', label: 'O teu telefone' },
  { key: 'meu_email', label: 'O teu email' },
  { key: 'meu_site', label: 'O teu site' },
  { key: 'portfolio', label: 'Link do portfólio' },
  { key: 'portfolio_design', label: 'Link do portfólio de design gráfico' },
  { key: 'projetos', label: 'Projetos (links separados por ·)' },
  { key: 'assinatura', label: 'Assinatura completa' },
  { key: 'opt_out', label: 'Linha de opt-out (RGPD)' },
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]['key'];
export type TemplateContext = Partial<Record<TemplateVariable, string | null>>;

const VARIABLE_KEYS = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi;

export interface SignatureInfo {
  full_name: string;
  role_title?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  portfolio_url?: string | null;
  design_portfolio_url?: string | null;
  project_links?: readonly string[] | null;
}

export interface LeadForTemplate {
  company_name: string;
  contact_name?: string | null;
  city?: string | null;
  problems?: string | null;
  approach_angle?: string | null;
  website?: string | null;
  first_contact_on?: string | null;
  sector?: { name: string } | null;
  services?: readonly string[] | null;
}

/** "https://vndesign.pt/" → "vndesign.pt" */
function bareHost(url: string | null | undefined): string {
  return (url ?? '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

/** Bloco de assinatura, no formato dos emails atuais da folha. */
export function formatSignature(sig: SignatureInfo | null | undefined): string {
  if (!sig) return '';
  const line2 = [sig.role_title, sig.company].filter(Boolean).join(' · ');
  const line3 = [sig.phone, bareHost(sig.website) || null].filter(Boolean).join(' · ');
  return [sig.full_name, line2, line3].filter((l) => l && l.trim()).join('\n');
}

/** "Identidade Visual" → "identidade visual" (mantém siglas como "SEO"). */
function lowerLabel(label: string): string {
  return label
    .split(/(\s+)/)
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /[A-ZÀ-Ý]/.test(w) ? w : w.toLowerCase()))
    .join('');
}

/** ["a", "b", "c"] → "a, b e c" */
function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

/**
 * Variáveis que vêm dos serviços do lead: {{servicos}}, {{categoria}} e
 * {{beneficio}} (a frase de valor do primeiro serviço que a tiver).
 */
export function serviceTemplateValues(
  services: readonly string[] | null | undefined,
  catalog: readonly ServiceInfo[] = DEFAULT_SERVICES,
  categories: readonly ServiceCategoryInfo[] = DEFAULT_SERVICE_CATEGORIES,
): { servicos: string | null; categoria: string | null; beneficio: string | null; category: ServiceCategoryInfo | null } {
  const keys = new Set(services ?? []);
  const list = catalog.filter((s) => keys.has(s.key));
  const categoryKey = leadServiceCategory(services, catalog);
  const category = categories.find((c) => c.key === categoryKey) ?? null;
  return {
    servicos: list.length ? joinPt(list.map((s) => lowerLabel(s.label))) : null,
    categoria: category ? lowerLabel(category.label) : null,
    beneficio: list.find((s) => s.value_phrase?.trim())?.value_phrase?.trim() ?? null,
    category,
  };
}

export function buildTemplateContext(input: {
  lead?: LeadForTemplate | null;
  signature?: SignatureInfo | null;
  sectorArguments?: string | null;
  optOutLine?: string | null;
  today: string;
  /** Catálogo do workspace (Definições → Serviços); sem ele, os serviços de origem. */
  services?: readonly ServiceInfo[];
  categories?: readonly ServiceCategoryInfo[];
}): TemplateContext {
  const { lead, signature: sig } = input;
  const svc = serviceTemplateValues(lead?.services, input.services, input.categories);
  // Leads de uma categoria com portefólio de design (ex.: Design Gráfico): {{portfolio}} usa esse.
  const designPortfolio = svc.category?.design_portfolio ? (sig?.design_portfolio_url ?? null) : null;
  return {
    empresa: lead?.company_name ?? null,
    contacto: lead?.contact_name ?? null,
    setor: lead?.sector?.name ?? null,
    cidade: lead?.city ?? null,
    problema: lead?.problems ?? null,
    angulo: lead?.approach_angle ?? null,
    website: lead?.website ?? null,
    argumentos: input.sectorArguments ?? null,
    servicos: svc.servicos,
    categoria: svc.categoria,
    beneficio: svc.beneficio,
    data: formatDate(lead?.first_contact_on ?? input.today),
    hoje: formatDate(input.today),
    meu_nome: sig?.full_name ?? null,
    meu_cargo: sig?.role_title ?? null,
    meu_telefone: sig?.phone ?? null,
    meu_email: sig?.email ?? null,
    meu_site: sig?.website ?? null,
    portfolio: designPortfolio ?? sig?.portfolio_url ?? sig?.website ?? null,
    portfolio_design: sig?.design_portfolio_url ?? sig?.portfolio_url ?? sig?.website ?? null,
    projetos: sig?.project_links?.length ? sig.project_links.join(' · ') : null,
    assinatura: formatSignature(sig) || null,
    opt_out: input.optOutLine ?? null,
  };
}

export interface RenderResult {
  text: string;
  /** Variáveis usadas no texto mas sem valor (e sem alternativa). */
  missing: TemplateVariable[];
  /** Nomes entre {{ }} que não existem. */
  unknown: string[];
}

/** Arruma o que fica de variáveis vazias: espaços duplos, " ," e linhas vazias a mais. */
function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/\(\s*\)/g, '')
        .replace(/[ \t]+$/g, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderTemplate(template: string | null | undefined, context: TemplateContext): RenderResult {
  const missing = new Set<TemplateVariable>();
  const unknown = new Set<string>();
  const text = (template ?? '').replace(PLACEHOLDER, (match, rawKey: string, fallback?: string) => {
    const key = rawKey.toLowerCase();
    if (!VARIABLE_KEYS.has(key)) {
      unknown.add(rawKey);
      return match;
    }
    const value = context[key as TemplateVariable];
    if (value && value.trim()) return value.trim();
    if (fallback !== undefined) return fallback.trim();
    missing.add(key as TemplateVariable);
    return '';
  });
  return { text: tidy(text), missing: [...missing], unknown: [...unknown] };
}

/** Variáveis usadas num texto (para mostrar no editor). */
export function templateVariablesIn(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!.toLowerCase()))];
}

/** Link "mailto:" com assunto e corpo (espaços como %20, como os clientes de email esperam). */
export function mailtoUrl(to: string | null | undefined, subject?: string | null, body?: string | null): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const qs = params.toString().replace(/\+/g, '%20');
  return `mailto:${to ?? ''}${qs ? `?${qs}` : ''}`;
}

// -----------------------------------------------------------------------------
// Escolha do modelo para um lead
// -----------------------------------------------------------------------------

type RankableTemplate = { category?: string | null; sector_id: string | null; is_default: boolean };

/**
 * Ordem de sugestão: primeiro os modelos da categoria dos serviços do lead, depois
 * os de todas as categorias, por fim os de outras; a seguir os do setor do lead e
 * os predefinidos. Lead sem serviços: a categoria não conta.
 */
export function rankTemplatesForLead<T extends RankableTemplate>(
  templates: readonly T[],
  lead: { sector_id: string | null },
  category: string | null,
): T[] {
  const categoryRank = (t: T) => (!category ? 0 : t.category === category ? 0 : (t.category ?? null) === null ? 1 : 2);
  const sectorRank = (t: T) => Number(!(lead.sector_id && t.sector_id === lead.sector_id));
  return [...templates].sort(
    (a, b) => categoryRank(a) - categoryRank(b) || sectorRank(a) - sectorRank(b) || Number(b.is_default) - Number(a.is_default),
  );
}

// -----------------------------------------------------------------------------
// Sequência de follow-ups por email
// -----------------------------------------------------------------------------

export interface FollowUpPlan {
  /** Data da próxima ação (AAAA-MM-DD). */
  on: string;
  text: string;
  /** Número do follow-up seguinte (1, 2, 3…) ou null fora da sequência. */
  step: number | null;
  total: number;
}

/**
 * Próxima ação depois de um email enviado ao lead. `sent` = follow-ups já
 * enviados (0 depois do primeiro contacto). Com a sequência desligada, volta ao
 * follow-up simples de N dias (Definições → Follow-up e lembretes).
 */
export function planNextFollowUp(
  settings: { follow_up_days: number; follow_up_sequence: { enabled: boolean; steps: readonly { days: number }[] } },
  sent: number,
  today: string,
): FollowUpPlan {
  const steps = settings.follow_up_sequence.steps;
  const total = steps.length;
  if (!settings.follow_up_sequence.enabled || !total) {
    return { on: addDays(today, settings.follow_up_days), text: 'Enviar follow-up', step: null, total: 0 };
  }
  if (sent < total) {
    return { on: addDays(today, steps[sent]!.days), text: `Follow-up ${sent + 1} de ${total} por email`, step: sent + 1, total };
  }
  return { on: addDays(today, 7), text: 'Sem resposta aos follow-ups: ligar ou marcar Sem interesse', step: null, total };
}

/** "Re: assunto" sem repetir o "Re:". */
export function replySubject(subject: string): string {
  const clean = subject.replace(/^(\s*(re|res|fw|fwd|enc)\s*:\s*)+/i, '').trim();
  return clean ? `Re: ${clean}` : '';
}
