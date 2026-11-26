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
    /** Onde está guardada fora da plataforma (ex.: "Bitwarden · Clientes/Glowearo"). */
    vault_ref: z.string().nullable(),
    secret_changed_at: z.string().nullable().meta({ description: 'Quando a palavra-passe foi escrita ou trocada' }),
    handed_over_at: z.string().nullable().meta({ description: 'Quando os acessos foram entregues ao cliente' }),
    updated_at: z.string(),
  })
  .meta({ id: 'LeadAccess' });
export type LeadAccess = z.infer<typeof LeadAccessSchema>;

/** A partir de um ano, a palavra-passe de um acesso já devia ter sido trocada. */
export const ACCESS_STALE_DAYS = 365;

/**
 * Há quantos dias a palavra-passe deste acesso não muda (null = não há palavra-passe
 * guardada, ou nunca se soube quando mudou).
 */
export function accessSecretAge(access: Pick<LeadAccess, 'has_secret' | 'secret_changed_at'>, now = new Date()): number | null {
  if (!access.has_secret || !access.secret_changed_at) return null;
  const changed = new Date(access.secret_changed_at).getTime();
  if (Number.isNaN(changed)) return null;
  return Math.floor((now.getTime() - changed) / 86_400_000);
}

/** Palavra-passe guardada há muito tempo (um ano): vale a pena trocá-la. */
export function accessIsStale(access: Pick<LeadAccess, 'has_secret' | 'secret_changed_at'>, now = new Date()): boolean {
  const age = accessSecretAge(access, now);
  return age !== null && age >= ACCESS_STALE_DAYS;
}

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
    /** Em vez de guardar a palavra-passe aqui: onde ela está (gestor de palavras-passe). */
    vault_ref: optionalText(200),
  })
  .meta({ id: 'LeadAccessUpsert' });
export type LeadAccessUpsert = z.output<typeof LeadAccessUpsertSchema>;

/**
 * Entregar os acessos ao cliente (fim do trabalho): marca-os como entregues e,
 * por omissão, apaga as palavras-passe guardadas aqui.
 */
export const LeadAccessHandoverSchema = z
  .object({
    ids: z.array(z.uuid()).min(1, { error: 'Escolhe pelo menos um acesso.' }).max(100),
    /** Apagar as palavras-passe guardadas (o acesso em si fica, com o endereço e o utilizador). */
    delete_secrets: z.boolean().optional().default(true),
  })
  .meta({ id: 'LeadAccessHandover' });
export type LeadAccessHandover = z.output<typeof LeadAccessHandoverSchema>;
