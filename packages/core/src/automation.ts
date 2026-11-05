/**
 * Regras automáticas: "se o lead cumpre TODAS estas condições, faz isto". Correm ao
 * criar/editar um lead e no cron diário (para "parado há N dias"); cada regra aplica-se
 * uma só vez a cada lead. A decisão (ruleMatches) é pura, para testar e pré-visualizar.
 */
import { z } from 'zod';
import { LEAD_CHANNELS, LEAD_CHANNEL_META, LEAD_STATUSES, LEAD_STATUS_META, type LeadChannel, type LeadStatus } from './enums';
import { normalizeText } from './normalize';

const tag = z.string().trim().min(1, { error: 'Escreve a etiqueta.' }).max(40);

export const RuleConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('no_website') }),
  z.object({ type: z.literal('has_website') }),
  z.object({ type: z.literal('no_email') }),
  z.object({ type: z.literal('no_phone') }),
  z.object({ type: z.literal('status_in'), values: z.array(z.enum(LEAD_STATUSES)).min(1, { error: 'Escolhe pelo menos uma fase.' }) }),
  z.object({ type: z.literal('sector_in'), values: z.array(z.uuid()).min(1, { error: 'Escolhe pelo menos um setor.' }) }),
  z.object({ type: z.literal('city_is'), value: z.string().trim().min(1, { error: 'Escreve a cidade.' }).max(80) }),
  z.object({ type: z.literal('channel_is'), value: z.enum(LEAD_CHANNELS) }),
  z.object({ type: z.literal('has_tag'), value: tag }),
  z.object({ type: z.literal('not_tag'), value: tag }),
  z.object({ type: z.literal('idle_days'), days: z.coerce.number().int().min(1).max(365) }),
]);
export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type RuleConditionType = RuleCondition['type'];

export const RuleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_tag'), value: tag }),
  z.object({ type: z.literal('remove_tag'), value: tag }),
  z.object({ type: z.literal('set_status'), value: z.enum(LEAD_STATUSES) }),
  z.object({ type: z.literal('assign_to'), user_id: z.uuid({ error: 'Escolhe a pessoa.' }) }),
  z.object({
    type: z.literal('create_task'),
    title: z.string().trim().min(1, { error: 'Escreve a tarefa.' }).max(300),
    due_in_days: z.coerce.number().int().min(0).max(365).default(0),
  }),
  z.object({
    type: z.literal('set_next_action'),
    text: z.string().trim().min(1, { error: 'Escreve a próxima ação.' }).max(200),
    in_days: z.coerce.number().int().min(0).max(365).default(0),
  }),
]);
export type RuleAction = z.infer<typeof RuleActionSchema>;
export type RuleActionType = RuleAction['type'];

export const CONDITION_LABELS: Record<RuleConditionType, string> = {
  no_website: 'Não tem site',
  has_website: 'Tem site',
  no_email: 'Não tem email',
  no_phone: 'Não tem telefone',
  status_in: 'Está na fase',
  sector_in: 'É do setor',
  city_is: 'É da cidade',
  channel_is: 'Veio pelo canal',
  has_tag: 'Tem a etiqueta',
  not_tag: 'Não tem a etiqueta',
  idle_days: 'Parado na fase há pelo menos',
};
export const ACTION_LABELS: Record<RuleActionType, string> = {
  add_tag: 'Pôr a etiqueta',
  remove_tag: 'Tirar a etiqueta',
  set_status: 'Mudar a fase para',
  assign_to: 'Passar para',
  create_task: 'Criar a tarefa',
  set_next_action: 'Marcar a próxima ação',
};

export const AutomationRuleSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    enabled: z.boolean(),
    conditions: z.array(RuleConditionSchema),
    actions: z.array(RuleActionSchema),
    position: z.int(),
    runs: z.int().meta({ description: 'A quantos leads já se aplicou' }),
    last_run_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'AutomationRule' });
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;

export const AutomationRuleCreateSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Dá um nome à regra.' }).max(120),
    enabled: z.boolean().default(true),
    conditions: z.array(RuleConditionSchema).min(1, { error: 'Junta pelo menos uma condição.' }).max(10),
    actions: z.array(RuleActionSchema).min(1, { error: 'Junta pelo menos uma ação.' }).max(10),
  })
  .meta({ id: 'AutomationRuleCreate' });
export type AutomationRuleCreate = z.infer<typeof AutomationRuleCreateSchema>;
export const AutomationRuleUpdateSchema = AutomationRuleCreateSchema.partial().meta({ id: 'AutomationRuleUpdate' });

export const RulePreviewSchema = z.object({ conditions: z.array(RuleConditionSchema).min(1).max(10) }).meta({ id: 'AutomationRulePreview' });

/** O que a regra precisa de saber do lead. */
export interface RuleLead {
  website: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  sector_id: string | null;
  city: string | null;
  channel: LeadChannel | null;
  tags: string[] | null;
  status_changed_at: string | null;
}

const blank = (v: string | null | undefined) => !v || !v.trim();
const sameTag = (a: string, b: string) => normalizeText(a) === normalizeText(b);

export function conditionMatches(c: RuleCondition, lead: RuleLead, now: Date = new Date()): boolean {
  switch (c.type) {
    case 'no_website':
      return blank(lead.website);
    case 'has_website':
      return !blank(lead.website);
    case 'no_email':
      return blank(lead.email);
    case 'no_phone':
      return blank(lead.phone);
    case 'status_in':
      return c.values.includes(lead.status);
    case 'sector_in':
      return !!lead.sector_id && c.values.includes(lead.sector_id);
    case 'city_is':
      return !!lead.city && normalizeText(lead.city) === normalizeText(c.value);
    case 'channel_is':
      return lead.channel === c.value;
    case 'has_tag':
      return (lead.tags ?? []).some((t) => sameTag(t, c.value));
    case 'not_tag':
      return !(lead.tags ?? []).some((t) => sameTag(t, c.value));
    case 'idle_days': {
      if (!lead.status_changed_at) return false;
      return now.getTime() - Date.parse(lead.status_changed_at) >= c.days * 86_400_000;
    }
  }
}

/** Todas as condições (e pelo menos uma). */
export function ruleMatches(conditions: readonly RuleCondition[], lead: RuleLead, now: Date = new Date()): boolean {
  return conditions.length > 0 && conditions.every((c) => conditionMatches(c, lead, now));
}

/** A regra depende do tempo (tem de correr também no cron diário)? */
export const ruleUsesTime = (conditions: readonly RuleCondition[]) => conditions.some((c) => c.type === 'idle_days');

type Lookups = { sectors?: Map<string, string>; people?: Map<string, string> };

/** "Não tem site", "Está na fase Contactado ou Respondeu", "Parado na fase há pelo menos 21 dias". */
export function describeCondition(c: RuleCondition, lookups: Lookups = {}): string {
  const label = CONDITION_LABELS[c.type];
  switch (c.type) {
    case 'status_in':
      return `${label} ${c.values.map((v) => LEAD_STATUS_META[v].label).join(' ou ')}`;
    case 'sector_in':
      return `${label} ${c.values.map((v) => lookups.sectors?.get(v) ?? 'setor apagado').join(' ou ')}`;
    case 'city_is':
      return `${label} ${c.value}`;
    case 'channel_is':
      return `${label} ${LEAD_CHANNEL_META[c.value].label}`;
    case 'has_tag':
    case 'not_tag':
      return `${label} “${c.value}”`;
    case 'idle_days':
      return `${label} ${c.days} dia${c.days === 1 ? '' : 's'}`;
    default:
      return label;
  }
}

export function describeAction(a: RuleAction, lookups: Lookups = {}): string {
  const label = ACTION_LABELS[a.type];
  const days = (n: number) => (n === 0 ? 'para hoje' : n === 1 ? 'para amanhã' : `para daqui a ${n} dias`);
  switch (a.type) {
    case 'add_tag':
    case 'remove_tag':
      return `${label} “${a.value}”`;
    case 'set_status':
      return `${label} ${LEAD_STATUS_META[a.value].label}`;
    case 'assign_to':
      return `${label} ${lookups.people?.get(a.user_id) ?? 'alguém que saiu da equipa'}`;
    case 'create_task':
      return `${label} “${a.title}” ${days(a.due_in_days)}`;
    case 'set_next_action':
      return `${label} “${a.text}” ${days(a.in_days)}`;
  }
}
