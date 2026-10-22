/**
 * Contratos de prestação de serviços: gerados a partir da proposta (objeto,
 * prazo, revisões, valor e pagamentos, condições gerais), editáveis até serem
 * aceites e aceites online pelo cliente (/c/<código>).
 */
import { z } from 'zod';
import { formatCurrency, formatDate } from './format';

export const CONTRACT_STATUSES = ['rascunho', 'enviado', 'aceite'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aceite: 'Aceite pelo cliente',
};

const text = (max: number) => z.string().trim().max(max, { error: `Máximo de ${max} caracteres.` });

export const ContractPartySchema = z.object({
  name: text(200).min(1, { error: 'Indica o nome.' }),
  company: text(200).nullable().default(null),
  nif: text(20).nullable().default(null),
  address: text(300).nullable().default(null),
  email: text(254).nullable().default(null),
  phone: text(40).nullable().default(null),
});
export type ContractParty = z.infer<typeof ContractPartySchema>;

export const ContractSectionSchema = z.object({
  title: text(120).min(1, { error: 'Dá um título à cláusula.' }),
  body: text(6000),
});
export type ContractSection = z.infer<typeof ContractSectionSchema>;

export const ContractContentSchema = z
  .object({
    provider: ContractPartySchema,
    client: ContractPartySchema,
    sections: z.array(ContractSectionSchema).min(1, { error: 'O contrato precisa de pelo menos uma cláusula.' }).max(30),
  })
  .meta({ id: 'ContractContent' });
export type ContractContent = z.infer<typeof ContractContentSchema>;

export const LeadContractSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    proposal_id: z.uuid().nullable(),
    number: z.int(),
    title: z.string(),
    content: ContractContentSchema,
    status: z.enum(CONTRACT_STATUSES),
    token: z.string().meta({ description: 'Link do cliente: /c/<token>' }),
    sent_at: z.string().nullable(),
    accepted_at: z.string().nullable(),
    accepted_name: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'LeadContract' });
export type LeadContract = z.infer<typeof LeadContractSchema>;

export const ContractCreateSchema = z
  .object({ proposal_id: z.uuid().nullable().optional().meta({ description: 'Proposta de base (por omissão: a aceite ou a mais recente)' }) })
  .meta({ id: 'ContractCreate' });

export const ContractUpdateSchema = z
  .object({ title: text(200).min(1, { error: 'Dá um título ao contrato.' }), content: ContractContentSchema })
  .partial()
  .meta({ id: 'ContractUpdate' });
export type ContractUpdate = z.output<typeof ContractUpdateSchema>;

export const ContractAcceptSchema = z
  .object({
    name: text(120).min(2, { error: 'Escreve o teu nome completo.' }),
    agree: z.literal(true, { error: 'Confirma que leste e aceitas o contrato.' }),
  })
  .meta({ id: 'ContractAccept' });

/** O que o contrato precisa para ser montado (tudo opcional, menos as partes). */
export interface ContractInput {
  provider: ContractParty;
  client: ContractParty;
  proposal?: {
    items: { name: string; description?: string | null; price: number; quantity?: number | null }[];
    total: number;
    payment_terms?: string | null;
  } | null;
  servicesText?: string | null;
  estimatedValue?: number | null;
  dueOn?: string | null;
  revisionsIncluded?: number | null;
  payments?: { description: string; amount: number; due_on: string | null }[];
  taxNote?: string | null;
  clauses?: string | null;
}

const euros = (v: number) => formatCurrency(v);

/** Cláusulas de partida do contrato (editáveis antes de enviar). */
export function buildContractContent(input: ContractInput): ContractContent {
  const who = input.provider.company || input.provider.name;
  const client = input.client.company || input.client.name;
  const items = input.proposal?.items ?? [];
  const objeto = items.length
    ? [
        `${who} compromete-se a realizar para ${client} o seguinte trabalho:`,
        ...items.map((i) => {
          const qty = i.quantity && i.quantity > 1 ? ` (× ${i.quantity})` : '';
          return `• ${i.name}${qty}${i.description ? ` — ${i.description}` : ''}`;
        }),
      ].join('\n')
    : `${who} compromete-se a realizar para ${client} ${input.servicesText ? `os serviços de ${input.servicesText}` : 'o trabalho combinado'}, nos termos da proposta enviada.`;

  const prazo = [
    input.dueOn ? `A entrega está prevista até ${formatDate(input.dueOn)}.` : 'A data de entrega é combinada entre as partes no início do projeto.',
    'O prazo conta a partir da receção de todos os conteúdos necessários e pode ser ajustado se houver atrasos nas respostas ou aprovações.',
  ].join(' ');

  const n = input.revisionsIncluded ?? 2;
  const revisoes = `Estão incluídas ${n} ronda${n === 1 ? '' : 's'} de revisão. Alterações além destas, ou fora do âmbito descrito, são orçamentadas à parte e só avançam depois de aprovadas pelo cliente.`;

  const total = input.proposal?.total ?? input.estimatedValue ?? null;
  const valor = [
    total ? `Valor total: ${euros(total)}.${input.taxNote ? ` ${input.taxNote}` : ''}` : 'Valor conforme a proposta aceite.',
    input.payments?.length
      ? ['Pagamentos:', ...input.payments.map((p) => `• ${p.description}: ${euros(p.amount)}${p.due_on ? ` — até ${formatDate(p.due_on)}` : ' — na entrega'}`)].join('\n')
      : input.proposal?.payment_terms
        ? `Pagamentos: ${input.proposal.payment_terms}`
        : null,
  ]
    .filter(Boolean)
    .join('\n');

  const sections: ContractSection[] = [
    { title: 'Objeto', body: objeto },
    { title: 'Prazo', body: prazo },
    { title: 'Revisões', body: revisoes },
    { title: 'Valor e pagamentos', body: valor },
  ];
  const clauses = (input.clauses ?? '')
    .split('\n')
    .map((c) => c.trim())
    .filter(Boolean);
  if (clauses.length) sections.push({ title: 'Condições gerais', body: clauses.map((c) => `• ${c}`).join('\n') });
  return { provider: input.provider, client: input.client, sections };
}
