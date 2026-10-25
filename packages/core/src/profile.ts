/**
 * Perfil de cada pessoa: o nome a mostrar (alcunha) e a foto, no menu, na
 * equipa e no "Responsável". Sem alcunha, vale o nome da assinatura e, por
 * fim, a parte do email antes do @.
 */
import { z } from 'zod';

export const PROFILE_NAME_MAX = 60;
export const AVATAR_MAX_BYTES = 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Lado da foto guardada (o browser recorta ao centro e reduz antes de enviar). */
export const AVATAR_SIZE = 256;

export const ProfileSchema = z
  .object({
    name: z.string().meta({ description: 'O nome a mostrar (alcunha, nome da assinatura ou o início do email)' }),
    display_name: z.string().nullable().meta({ description: 'A alcunha escolhida (null = usa o nome da assinatura)' }),
    avatar_url: z.string().nullable().meta({ description: 'Endereço da foto (null = sem foto: mostram-se as iniciais)' }),
  })
  .meta({ id: 'Profile' });
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileUpdateSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .max(PROFILE_NAME_MAX, { error: `Máximo de ${PROFILE_NAME_MAX} caracteres.` })
      .nullable()
      .transform((v) => v || null),
  })
  .meta({ id: 'ProfileUpdate' });
export type ProfileUpdateInput = z.input<typeof ProfileUpdateSchema>;

/** O nome a mostrar: a alcunha, senão o nome da assinatura, senão o início do email. */
export function profileName(displayName: string | null | undefined, fullName: string | null | undefined, email: string | null | undefined): string {
  return displayName?.trim() || fullName?.trim() || email?.split('@')[0] || 'Sem nome';
}

/** Iniciais para a foto por omissão: "Va Nancassa" → "VN"; "vndesign.work" → "VW"; "Ana" → "A". */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  const letters = parts.length === 1 ? parts[0]!.slice(0, 1) : `${parts[0]!.slice(0, 1)}${parts.at(-1)!.slice(0, 1)}`;
  return letters.toLocaleUpperCase('pt-PT');
}
