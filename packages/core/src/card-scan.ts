/**
 * Ler um cartão de visita com a câmara: a IA lê a fotografia e devolve os
 * dados do lead (só para preencher o formulário; a pessoa revê antes de criar).
 */
import { z } from 'zod';
import { normalizeEmail } from './normalize';

/** Até ~6 MB em base64 (a app reduz a foto antes de enviar). */
export const CardScanInputSchema = z
  .object({
    image: z
      .string({ error: 'Falta a fotografia.' })
      .max(8_000_000, { error: 'Fotografia demasiado grande.' })
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, { error: 'Formato de imagem inválido (JPEG, PNG ou WebP).' }),
  })
  .meta({ id: 'CardScanInput' });

export const CardScanDraftSchema = z.object({
  empresa: z.string().nullable(),
  contacto: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  site: z.string().nullable(),
  cidade: z.string().nullable(),
  morada: z.string().nullable(),
  notas: z.string().nullable(),
});
export type CardScanDraft = z.infer<typeof CardScanDraftSchema>;

export const CardScanResultSchema = z
  .object({
    company_name: z.string().nullable(),
    contact_name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    website: z.string().nullable(),
    city: z.string().nullable(),
    address: z.string().nullable(),
    notes: z.string().nullable(),
    model: z.string(),
  })
  .meta({ id: 'CardScanResult' });
export type CardScanResult = z.infer<typeof CardScanResultSchema>;

export const CARD_SCAN_SYSTEM_PROMPT = `Lês a fotografia de um cartão de visita de uma empresa (Portugal, normalmente) e extrais os dados para a ficha de um lead.
Devolves: empresa, contacto (nome da pessoa), email, telefone (como está escrito), site, cidade, morada e notas (cargo ou outros dados úteis, curto).
Usa null para o que não estiver no cartão ou não se ler bem. Não inventes nada.`;

/** Limpa a leitura: email válido em minúsculas, site sem espaços, textos curtos. */
export function cardScanResult(d: CardScanDraft, model: string): CardScanResult {
  const t = (v: string | null, max: number) => (v && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);
  const email = d.email ? normalizeEmail(d.email) : null;
  const site = t(d.site, 300)?.replace(/\s/g, '') ?? null;
  return {
    company_name: t(d.empresa, 300),
    contact_name: t(d.contacto, 160),
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
    phone: t(d.telefone, 60),
    website: site && /\./.test(site) ? site : null,
    city: t(d.cidade, 120),
    address: t(d.morada, 300),
    notes: t(d.notas, 500),
    model,
  };
}
