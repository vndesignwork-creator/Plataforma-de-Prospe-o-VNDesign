/**
 * Kit da marca do cliente: logótipos e ficheiros, cores, tipos de letra, links
 * (Drive, Figma…) e acessos (domínio, alojamento, redes). É do cliente, por
 * isso é o mesmo em todos os projetos dele (fica no registo principal).
 */
import { z } from 'zod';

export const BRAND_MAX_FILES = 30;
export const BRAND_MAX_FILE_BYTES = 25 * 1024 * 1024;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const BrandColorSchema = z.object({
  name: z.string().trim().max(60).default(''),
  hex: z
    .string()
    .trim()
    .transform((v) => (v.startsWith('#') ? v : `#${v}`).toLowerCase())
    .pipe(z.string().regex(HEX, { error: 'Cor inválida (ex.: #ef5c32).' })),
});
export type BrandColor = z.output<typeof BrandColorSchema>;

export const BrandFontSchema = z.object({
  name: z.string().trim().min(1, { error: 'Indica o tipo de letra.' }).max(80),
  usage: z.string().trim().max(80).default(''),
});

export const BrandLinkSchema = z.object({
  label: z.string().trim().max(80).default(''),
  url: z.url({ protocol: /^https?$/, error: 'Link inválido (começa por https://).' }).max(1000),
});

export const BrandFileSchema = z.object({
  name: z.string(),
  size: z.int(),
  type: z.string(),
  url: z.string().meta({ description: 'Descarregar (redireciona para um link temporário)' }),
});

export const BrandKitSchema = z
  .object({
    main_id: z.uuid().meta({ description: 'Registo principal do cliente (onde o kit fica guardado)' }),
    colors: z.array(BrandColorSchema),
    fonts: z.array(BrandFontSchema),
    links: z.array(BrandLinkSchema),
    files: z.array(BrandFileSchema),
    notes: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .meta({ id: 'BrandKit' });
export type BrandKit = z.infer<typeof BrandKitSchema>;

export const BrandKitUpdateSchema = z
  .object({
    colors: z.array(BrandColorSchema).max(24, { error: 'Máximo de 24 cores.' }).optional(),
    fonts: z.array(BrandFontSchema).max(12, { error: 'Máximo de 12 tipos de letra.' }).optional(),
    links: z.array(BrandLinkSchema).max(30, { error: 'Máximo de 30 links.' }).optional(),
    notes: z.string().trim().max(5000).nullish().transform((v) => v || null),
  })
  .meta({ id: 'BrandKitUpdate' });
export type BrandKitUpdate = z.output<typeof BrandKitUpdateSchema>;

export const LeadAccessSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    url: z.string().nullable(),
    username: z.string().nullable(),
    has_secret: z.boolean().meta({ description: 'Tem palavra-passe guardada (pede-se à parte)' }),
    notes: z.string().nullable(),
    shared: z.boolean().meta({ description: 'Os colaboradores do projeto veem este acesso' }),
    updated_at: z.string(),
  })
  .meta({ id: 'LeadAccess' });
export type LeadAccess = z.infer<typeof LeadAccessSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const LeadAccessUpsertSchema = z
  .object({
    label: z.string().trim().min(1, { error: 'Diz o que é (ex.: Alojamento Hostinger).' }).max(120),
    url: optionalText(500),
    username: optionalText(200),
    /** Nova palavra-passe; vazia = mantém a guardada; null = apaga-a. */
    secret: z.string().max(500).nullish(),
    notes: optionalText(1000),
    shared: z.boolean().optional().default(false),
  })
  .meta({ id: 'LeadAccessUpsert' });
export type LeadAccessUpsert = z.output<typeof LeadAccessUpsertSchema>;
