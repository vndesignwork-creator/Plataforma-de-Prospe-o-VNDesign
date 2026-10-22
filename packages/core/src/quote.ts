/**
 * Calculadora de orçamento: pacotes dos serviços + extras (página extra, idioma,
 * textos…) → total, horas estimadas (pelos projetos anteriores e pelas horas de
 * cada extra) e o ganho por hora comparado com o objetivo.
 */
import { z } from 'zod';

export const QuoteExtraSchema = z.object({
  name: z.string().trim().min(1, { error: 'Indica o nome do extra.' }).max(80),
  /** Preço por unidade (ou percentagem, em "percent"). */
  price: z.number().min(0).max(1_000_000),
  /** "fixed" = € por unidade; "percent" = % sobre o valor único (ex.: urgência +20%). */
  kind: z.enum(['fixed', 'percent']).default('fixed'),
  /** Unidade mostrada ("página", "idioma", "mês"…). */
  unit: z.string().trim().max(20).default(''),
  /** Horas de trabalho por unidade (para a estimativa). */
  hours: z.number().min(0).max(500).default(0),
  /** Mensal (manutenção, alojamento…): fica à parte do total único. */
  recurring: z.boolean().default(false),
});
export type QuoteExtra = z.output<typeof QuoteExtraSchema>;

export const DEFAULT_QUOTE_EXTRAS: QuoteExtra[] = [
  { name: 'Página extra', price: 80, kind: 'fixed', unit: 'página', hours: 3, recurring: false },
  { name: 'Idioma extra', price: 150, kind: 'fixed', unit: 'idioma', hours: 4, recurring: false },
  { name: 'Textos (copywriting)', price: 40, kind: 'fixed', unit: 'página', hours: 1.5, recurring: false },
  { name: 'Fotografias de banco', price: 15, kind: 'fixed', unit: 'imagem', hours: 0.25, recurring: false },
  { name: 'Reservas ou formulário avançado', price: 120, kind: 'fixed', unit: '', hours: 4, recurring: false },
  { name: 'Integração (pagamentos, newsletter…)', price: 100, kind: 'fixed', unit: '', hours: 3, recurring: false },
  { name: 'Urgência (prazo curto)', price: 20, kind: 'percent', unit: '', hours: 0, recurring: false },
  { name: 'Manutenção mensal', price: 35, kind: 'fixed', unit: 'mês', hours: 1, recurring: true },
];

export const QuoteSettingsSchema = z.object({
  /** Quanto queres ganhar por hora (para comparar). */
  hourly_target: z.number().min(0).max(1000).nullable().default(35),
  extras: z.array(QuoteExtraSchema).max(40).default(DEFAULT_QUOTE_EXTRAS),
});
export type QuoteSettings = z.output<typeof QuoteSettingsSchema>;
export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = { hourly_target: 35, extras: DEFAULT_QUOTE_EXTRAS };

export interface QuoteLine {
  name: string;
  price: number;
  quantity: number;
  recurring: boolean;
  /** Horas estimadas desta linha (total, não por unidade). */
  hours: number | null;
  package_id?: string | null;
  description?: string | null;
  features?: string[];
}

export interface QuoteResult {
  once: number;
  monthly: number;
  discount: number;
  total: number;
  /** Horas estimadas (null = sem dados para estimar). */
  hours: number | null;
  /** € por hora com este preço (só o valor único). */
  rate: number | null;
  /** Preço que daria o objetivo por hora. */
  suggested: number | null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Soma as linhas (pacotes e extras fixos), aplica as percentagens sobre o valor
 * único e o desconto, e estima o €/hora. Se alguma linha única não tiver horas
 * conhecidas, as horas ficam por estimar (salvo `hoursOverride`).
 */
export function computeQuote(
  lines: QuoteLine[],
  percents: { name: string; percent: number }[],
  discount: number,
  hourlyTarget: number | null,
  hoursOverride: number | null = null,
): QuoteResult {
  const once = lines.filter((l) => !l.recurring).reduce((s, l) => s + l.price * l.quantity, 0);
  const monthly = lines.filter((l) => l.recurring).reduce((s, l) => s + l.price * l.quantity, 0);
  const surcharge = percents.reduce((s, p) => s + (once * p.percent) / 100, 0);
  const subtotal = round2(once + surcharge);
  const d = Math.min(Math.max(0, discount), subtotal);
  const total = round2(subtotal - d);
  const onceLines = lines.filter((l) => !l.recurring);
  const estimated = onceLines.length && onceLines.every((l) => l.hours !== null) ? onceLines.reduce((s, l) => s + (l.hours ?? 0), 0) : null;
  const hours = hoursOverride !== null && hoursOverride > 0 ? round2(hoursOverride) : estimated !== null ? round2(estimated) : null;
  return {
    once: subtotal,
    monthly: round2(monthly),
    discount: d,
    total,
    hours,
    rate: hours && hours > 0 ? round2(total / hours) : null,
    suggested: hours && hourlyTarget ? Math.ceil((hours * hourlyTarget) / 5) * 5 : null,
  };
}

/** Itens para a proposta: as linhas tal como estão e cada percentagem já em euros. */
export function quoteProposalItems(lines: QuoteLine[], percents: { name: string; percent: number }[]) {
  const once = lines.filter((l) => !l.recurring).reduce((s, l) => s + l.price * l.quantity, 0);
  return [
    ...lines.map((l) => ({
      name: l.name,
      description: l.description ?? null,
      features: l.features ?? [],
      price: round2(l.price),
      quantity: Math.max(1, Math.round(l.quantity)),
      recurring: l.recurring,
      package_id: l.package_id ?? null,
    })),
    ...percents
      .filter((p) => p.percent > 0 && once > 0)
      .map((p) => ({
        name: `${p.name} (+${p.percent}%)`,
        description: null,
        features: [],
        price: round2((once * p.percent) / 100),
        quantity: 1,
        recurring: false,
        package_id: null,
      })),
  ];
}
