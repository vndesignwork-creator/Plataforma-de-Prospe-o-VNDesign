/**
 * Propostas comerciais: pacotes de serviços, itens, totais e texto inicial
 * sugerido a partir do diagnóstico do site. O PDF é gerado no servidor da web.
 */
import { z } from 'zod';
import type { AuditIssue } from './audit';

const money = z
  .number({ error: 'Indica um valor.' })
  .min(0, { error: 'O valor não pode ser negativo.' })
  .max(1_000_000)
  // toPrecision corrige o erro binário (1.005 * 100 = 100.4999…) antes de arredondar aos cêntimos.
  .transform((v) => Math.round(Number((v * 100).toPrecision(12))) / 100);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

// -----------------------------------------------------------------------------
// Pacotes
// -----------------------------------------------------------------------------
export const ServicePackageSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    price: z.number(),
    features: z.array(z.string()),
    delivery_days: z.int().nullable(),
    recommended: z.boolean(),
    sort_order: z.int(),
    archived_at: z.string().nullable(),
  })
  .meta({ id: 'ServicePackage' });
export type ServicePackage = z.infer<typeof ServicePackageSchema>;

export const ServicePackageCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Indica o nome do pacote.').max(120),
    description: optionalText(1000),
    price: money,
    features: z
      .array(z.string().trim().max(200))
      .max(30)
      .default([])
      .transform((f) => f.filter(Boolean)),
    delivery_days: z.int().min(1).max(365).nullish().transform((v) => v ?? null),
    recommended: z.boolean().default(false),
    sort_order: z.int().min(0).max(1000).optional(),
  })
  .meta({ id: 'ServicePackageCreate' });
export type ServicePackageCreateInput = z.input<typeof ServicePackageCreateSchema>;

// Nas atualizações parciais os campos com .default() são redefinidos sem ele:
// em Zod 4, .partial() continuaria a preencher o valor por omissão e um
// PATCH {archived: true} apagaria os pontos do pacote.
export const ServicePackageUpdateSchema = ServicePackageCreateSchema.partial()
  .extend({
    features: z
      .array(z.string().trim().max(200))
      .max(30)
      .transform((f) => f.filter(Boolean))
      .optional(),
    recommended: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .meta({ id: 'ServicePackageUpdate' });

// -----------------------------------------------------------------------------
// Propostas
// -----------------------------------------------------------------------------
export const PROPOSAL_STATUSES = ['rascunho', 'enviada', 'aceite', 'recusada'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceite: 'Aceite',
  recusada: 'Recusada',
};

export const ProposalItemSchema = z.object({
  name: z.string().trim().min(1, 'Indica o nome do item.').max(160),
  description: optionalText(1000),
  features: z
    .array(z.string().trim().max(200))
    .max(30)
    .default([])
    .transform((f) => f.filter(Boolean)),
  price: money,
  quantity: z.int().min(1).max(999).default(1),
  /** Mensal (ex.: manutenção) — mostrado como "/mês" e fora do total único. */
  recurring: z.boolean().default(false),
  package_id: z.uuid().nullish().transform((v) => v ?? null),
});
export type ProposalItem = z.infer<typeof ProposalItemSchema>;

/** Item como a API o devolve (sem transformações, para a documentação OpenAPI). */
export const ProposalItemOutputSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    features: z.array(z.string()),
    price: z.number(),
    quantity: z.int(),
    recurring: z.boolean(),
    package_id: z.uuid().nullable(),
  })
  .meta({ id: 'ProposalItem' });
export type ProposalItemInput = z.input<typeof ProposalItemSchema>;

const proposalFields = {
  title: z.string().trim().min(1, 'Indica um título.').max(200),
  intro: optionalText(4000),
  items: z.array(ProposalItemSchema).min(1, 'Acrescenta pelo menos um item.').max(30),
  discount: money.default(0),
  valid_until: z.iso.date({ error: 'Data inválida.' }).nullish().transform((v) => v ?? null),
  payment_terms: optionalText(1000),
  notes: optionalText(2000),
};

export const ProposalCreateSchema = z.object(proposalFields).meta({ id: 'ProposalCreate' });
export type ProposalCreateInput = z.input<typeof ProposalCreateSchema>;

// Sem o .default(0) do desconto: mudar só o estado não pode pôr o desconto a zero.
export const ProposalUpdateSchema = z
  .object({ ...proposalFields, discount: money, status: z.enum(PROPOSAL_STATUSES) })
  .partial()
  .meta({ id: 'ProposalUpdate' });
export type ProposalUpdateInput = z.input<typeof ProposalUpdateSchema>;

export const ProposalSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    number: z.int(),
    code: z.string().meta({ description: 'Número para mostrar, ex.: "2026-007"' }),
    title: z.string(),
    intro: z.string().nullable(),
    items: z.array(ProposalItemOutputSchema),
    discount: z.number(),
    total: z.number(),
    valid_until: z.string().nullable(),
    payment_terms: z.string().nullable(),
    notes: z.string().nullable(),
    status: z.enum(PROPOSAL_STATUSES),
    sent_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'Proposal' });
export type Proposal = z.infer<typeof ProposalSchema>;

export interface ProposalTotals {
  /** Soma dos itens únicos (sem os mensais). */
  subtotal: number;
  discount: number;
  total: number;
  /** Soma dos itens mensais (ex.: manutenção). */
  monthly: number;
}

const round2 = (v: number) => Math.round(Number((v * 100).toPrecision(12))) / 100;

export function proposalTotals(items: readonly Pick<ProposalItem, 'price' | 'quantity' | 'recurring'>[], discount = 0): ProposalTotals {
  const once = items.filter((i) => !i.recurring).reduce((s, i) => s + i.price * (i.quantity ?? 1), 0);
  const monthly = items.filter((i) => i.recurring).reduce((s, i) => s + i.price * (i.quantity ?? 1), 0);
  const d = Math.min(Math.max(discount, 0), once);
  return { subtotal: round2(once), discount: round2(d), total: round2(once - d), monthly: round2(monthly) };
}

/** "2026-007" (ano de criação + número sequencial). */
export function proposalCode(number: number, createdAt: string | Date): string {
  const year = new Date(createdAt).getFullYear();
  return `${year}-${String(number).padStart(3, '0')}`;
}

/** Item de proposta a partir de um pacote. */
export function itemFromPackage(pkg: Pick<ServicePackage, 'id' | 'name' | 'description' | 'price' | 'features'>, recurring = false): ProposalItem {
  return {
    name: pkg.name,
    description: pkg.description,
    features: [...pkg.features],
    price: pkg.price,
    quantity: 1,
    recurring,
    package_id: pkg.id,
  };
}

/** Pacotes com preço mensal (ex.: "Manutenção mensal") entram como recorrentes. */
export function isRecurringPackage(pkg: Pick<ServicePackage, 'name'>): boolean {
  return /mensal|mês|manuten/i.test(pkg.name);
}

/**
 * Texto inicial sugerido: apresenta o diagnóstico do site atual (problemas da
 * ficha e/ou da última análise) e o objetivo da proposta.
 */
export function suggestProposalIntro(input: {
  companyName: string;
  contactName?: string | null;
  website?: string | null;
  problems?: string | null;
  issues?: readonly Pick<AuditIssue, 'message' | 'severity'>[];
  approachAngle?: string | null;
}): string {
  const hello = input.contactName ? `Olá ${input.contactName},` : 'Olá,';
  const findings = [
    ...(input.issues ?? []).filter((i) => i.severity !== 'low').map((i) => i.message.replace(/\.$/, '')),
    ...(input.issues?.length ? [] : (input.problems ?? '').split(/\s*[;\n]\s*/).filter(Boolean)),
  ].slice(0, 6);
  const parts = [
    hello,
    input.website
      ? `Obrigado pelo seu tempo. Analisei o site atual da ${input.companyName} e preparei esta proposta para o tornar mais rápido, seguro e eficaz a trazer clientes.`
      : `Obrigado pelo seu tempo. Preparei esta proposta para a ${input.companyName} ter um site próprio, rápido e pensado para trazer clientes.`,
  ];
  if (findings.length) {
    parts.push(`O que encontrei:\n${findings.map((f) => `• ${f}`).join('\n')}`);
  }
  if (input.approachAngle) parts.push(`Proposta de foco: ${input.approachAngle}`);
  return parts.join('\n\n');
}
