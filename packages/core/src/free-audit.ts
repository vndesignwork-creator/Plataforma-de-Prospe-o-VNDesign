/**
 * "Analisar o meu site grátis": página pública (/analise/<código>) para pôr no teu site.
 * O visitante escreve o site e o email; entra como lead quente, o site é analisado e
 * recebe o diagnóstico em PDF por email (com o email de envio ligado).
 */
import { z } from 'zod';

export const FreeAuditSettingsSchema = z.object({
  /** Código secreto da página pública (null = desligada). */
  token: z.string().nullable().default(null),
});
export type FreeAuditSettings = z.infer<typeof FreeAuditSettingsSchema>;
export const DEFAULT_FREE_AUDIT: FreeAuditSettings = { token: null };

export const FreeAuditToggleSchema = z
  .object({
    enabled: z.boolean(),
    rotate: z.boolean().default(false).meta({ description: 'Criar outro código (o antigo deixa de funcionar)' }),
  })
  .meta({ id: 'FreeAuditToggle' });

const site = z
  .string({ error: 'Escreva o endereço do site.' })
  .trim()
  .min(4, { error: 'Escreva o endereço do site.' })
  .max(300)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.url({ protocol: /^https?$/, error: 'Endereço inválido (ex.: www.o-meu-negocio.pt).' }))
  // Precisa de um domínio com ponto (ex.: padaria.pt); endereços locais só servem em testes (o servidor recusa-os em produção).
  .refine((v) => {
    const host = new URL(v).hostname;
    return host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(host);
  }, { error: 'Endereço inválido (ex.: www.o-meu-negocio.pt).' });

export const FreeAuditSubmitSchema = z
  .object({
    website: site,
    email: z.email({ error: 'Email inválido.' }).trim().max(254),
    name: z.string().trim().max(120).optional().transform((v) => v || null),
    company: z.string().trim().max(200).optional().transform((v) => v || null),
    consent: z.literal(true, { error: 'Aceite que o contactemos com a análise.' }),
  })
  .meta({ id: 'FreeAuditSubmit' });
export type FreeAuditSubmit = z.output<typeof FreeAuditSubmitSchema>;

/** O email com o diagnóstico em anexo. */
export function freeAuditEmail(input: { name: string | null; company: string; host: string; sender: string | null }): { subject: string; body: string } {
  const first = input.name?.trim().split(/\s+/)[0];
  return {
    subject: `A análise do site ${input.host}`,
    body: [
      first ? `Olá ${first},` : 'Olá,',
      '',
      `Obrigado pelo pedido! Segue em anexo a análise do site ${input.host}: a velocidade no telemóvel, a segurança (o "Não seguro"), como aparece no Google e o que pode estar a afastar clientes.`,
      '',
      'Se quiser, explico-lhe os pontos principais numa chamada de 10 minutos, sem compromisso. Basta responder a este email com a melhor altura para si.',
      '',
      'Cumprimentos,',
    ].join('\n'),
  };
}

/** HTML para pôr no site: o botão (link) e a página dentro do site (iframe). */
export function freeAuditSnippets(url: string): { button: string; iframe: string } {
  return {
    button: `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#ef5c32;color:#fff;font-weight:600;text-decoration:none">Analisar o meu site grátis</a>`,
    iframe: `<iframe src="${url}?embed=1" title="Analisar o meu site grátis" style="width:100%;max-width:560px;height:620px;border:0;border-radius:12px" loading="lazy"></iframe>`,
  };
}
