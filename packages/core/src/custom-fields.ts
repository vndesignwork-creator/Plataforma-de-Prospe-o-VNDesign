/**
 * Campos personalizados: cada workspace cria os seus ("Nº de lojas", "Programa
 * de faturação", "Tem Instagram?"). Os valores ficam em leads.custom, por chave
 * curta e estável (o nome do campo pode mudar sem perder os valores).
 */
import { z } from 'zod';
import type { CustomValues } from './schemas';

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'yes_no', 'choice'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  yes_no: 'Sim / Não',
  choice: 'Escolha (lista)',
};

export const CustomFieldSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    label: z.string(),
    type: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string()),
    sort_order: z.int(),
  })
  .meta({ id: 'CustomField' });
export type CustomField = z.infer<typeof CustomFieldSchema>;

/** Opções de uma escolha: sem vírgulas (separam os filtros), sem repetidas, no máximo 30. */
export function cleanOptions(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const o = raw.replace(/,/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 60);
    const k = o.toLowerCase();
    if (!o || seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out.slice(0, 30);
}

export const CustomFieldCreateSchema = z
  .object({
    label: z.string().trim().min(1, { error: 'Indica o nome do campo.' }).max(60, { error: 'Máximo de 60 caracteres.' }),
    type: z.enum(CUSTOM_FIELD_TYPES, { error: 'Escolhe o tipo.' }),
    options: z.array(z.string()).max(60).default([]).transform(cleanOptions),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'choice' && v.options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Indica pelo menos 2 opções.' });
  })
  .meta({ id: 'CustomFieldCreate' });
export type CustomFieldCreateInput = z.input<typeof CustomFieldCreateSchema>;

export const CustomFieldUpdateSchema = z
  .object({
    label: z.string().trim().min(1, { error: 'Indica o nome do campo.' }).max(60, { error: 'Máximo de 60 caracteres.' }).optional(),
    options: z.array(z.string()).max(60).transform(cleanOptions).optional(),
    sort_order: z.int().min(0).max(9999).optional(),
  })
  .meta({ id: 'CustomFieldUpdate' });

/** Chave nova para um campo ("f" + 8 letras/algarismos). */
export function newCustomFieldKey(random: () => number = Math.random): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `f${Array.from({ length: 8 }, () => chars[Math.floor(random() * chars.length)]).join('')}`;
}

/**
 * Limpa os valores de um lead pelas definições: só campos que existem, cada um
 * do seu tipo (número, sim/não, uma das opções); vazios saem.
 */
export function sanitizeCustomValues(values: CustomValues, fields: readonly Pick<CustomField, 'key' | 'type' | 'options'>[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(n)) out[f.key] = n;
    } else if (f.type === 'yes_no') {
      if (typeof v === 'boolean') out[f.key] = v;
      else if (/^(sim|true|s|1)$/i.test(String(v).trim())) out[f.key] = true;
      else if (/^(não|nao|false|n|0)$/i.test(String(v).trim())) out[f.key] = false;
    } else if (f.type === 'choice') {
      const match = f.options.find((o) => o.toLowerCase() === String(v).trim().toLowerCase());
      if (match) out[f.key] = match;
    } else {
      const t = String(v).trim().slice(0, 500);
      if (t) out[f.key] = t;
    }
  }
  return out;
}

/** O valor para mostrar ("Sim", "12", "Primavera"…; vazio = ''). */
export function formatCustomValue(field: Pick<CustomField, 'type'>, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'yes_no') return value === true ? 'Sim' : value === false ? 'Não' : '';
  if (field.type === 'number' && typeof value === 'number') return value.toLocaleString('pt-PT');
  return String(value);
}

/** O valor no filtro da lista ("chave:valor"): sim/não como true/false, como fica guardado. */
export function customFilterValue(field: Pick<CustomField, 'key' | 'type'>, value: string): string {
  if (field.type === 'yes_no') return `${field.key}:${value === 'Sim' || value === 'true' ? 'true' : 'false'}`;
  return `${field.key}:${value}`;
}
