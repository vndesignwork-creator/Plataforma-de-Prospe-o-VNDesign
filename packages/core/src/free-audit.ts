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
  // (O zod corre esta verificação mesmo quando o endereço já falhou acima: daí o try.)
  .refine((v) => {
    try {
      const host = new URL(v).hostname;
      return host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(host);
    } catch {
      return false;
    }
  }, { error: 'Endereço inválido (ex.: www.o-meu-negocio.pt).', abort: true });

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
/** O texto de persuasão ao lado do formulário (o mesmo do plugin de WordPress). */
export const FREE_AUDIT_PROMO = {
  eyebrow: 'Análise gratuita · Sem compromisso',
  title: 'O seu site está a afastar clientes sem dar por isso?',
  text: 'Um site lento, com o aviso “Não seguro” ou difícil de encontrar no Google faz perder pedidos todos os dias. Em poucos minutos mostramos-lhe o que está a correr mal e como resolver.',
  points: [
    'Velocidade no telemóvel: quanto tempo os clientes esperam',
    'Segurança: se aparece o aviso “Não seguro”',
    'Google: como o seu negócio aparece nas pesquisas',
    'Os pormenores que levam os visitantes a desistir',
  ],
  note: 'Recebe o relatório em PDF no seu email, em linguagem simples. Sem custos e sem compromisso.',
  imageAlt: 'Exemplo do relatório da análise do site',
} as const;

export type FreeAuditLayout = {
  /** Mostrar o texto de persuasão ao lado do formulário. */
  promo: boolean;
  /** De que lado fica o texto (o formulário fica do outro). */
  side: 'right' | 'left';
};
export const DEFAULT_FREE_AUDIT_LAYOUT: FreeAuditLayout = { promo: true, side: 'left' };

/** O endereço da página com as escolhas (?texto=0, ?lado=direita, ?embed=1). De origem: texto à esquerda. */
export function freeAuditPageUrl(url: string, layout: FreeAuditLayout = DEFAULT_FREE_AUDIT_LAYOUT, embed = false): string {
  const q = new URLSearchParams();
  if (embed) q.set('embed', '1');
  if (!layout.promo) q.set('texto', '0');
  else if (layout.side === 'right') q.set('lado', 'direita');
  const qs = q.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Lê as escolhas do endereço da página. */
export function freeAuditLayoutFrom(params: { texto?: string; lado?: string }): FreeAuditLayout {
  return { promo: params.texto !== '0', side: params.lado === 'direita' ? 'right' : 'left' };
}

/**
 * O HTML para pôr no site sem o plugin: um botão que abre a página, ou a página dentro do
 * site (moldura que cresce sozinha à altura do conteúdo).
 */
export function freeAuditSnippets(url: string, layout: FreeAuditLayout = DEFAULT_FREE_AUDIT_LAYOUT): { button: string; iframe: string } {
  const origin = new URL(url).origin;
  const height = layout.promo ? 760 : 680;
  return {
    button: `<a href="${freeAuditPageUrl(url, layout)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#ef5c32;color:#0d0d0d;font-weight:600;text-decoration:none">Analisar o meu site grátis</a>`,
    iframe:
      `<iframe id="vnd-analise-gratis" src="${freeAuditPageUrl(url, layout, true)}" title="Analisar o meu site grátis" style="display:block;width:100%;height:${height}px;border:0" loading="lazy"></iframe>\n` +
      `<script>addEventListener("message",function(e){if(e.origin==="${origin}"&&e.data&&e.data.type==="vnd-fa-height"){var f=document.getElementById("vnd-analise-gratis");if(f)f.style.height=e.data.height+"px";}});</script>`,
  };
}
