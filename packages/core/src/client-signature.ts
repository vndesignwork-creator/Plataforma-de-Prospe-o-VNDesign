/**
 * Assinatura de email para o cliente: a partir do kit da marca (logótipo e
 * cores), sai o HTML pronto a colar no Gmail ou no Outlook. É um extra pequeno
 * que fica bem no fim de um projeto — e o cliente passa a andar com a marca
 * em cada email que envia.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const CLIENT_SIGNATURE_LAYOUTS = ['lado', 'baixo'] as const;
export type ClientSignatureLayout = (typeof CLIENT_SIGNATURE_LAYOUTS)[number];
export const CLIENT_SIGNATURE_LAYOUT_LABELS: Record<ClientSignatureLayout, string> = {
  lado: 'Logótipo ao lado',
  baixo: 'Logótipo por cima',
};

export interface ClientSignatureInput {
  name: string;
  role?: string | null;
  company: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  /** Cor da marca (dos códigos do kit); usada no nome e nos links. */
  color?: string | null;
  /** Logótipo já pronto a embutir (data: ou https:) e a largura no email. */
  logo?: { src: string; width: number } | null;
  layout?: ClientSignatureLayout;
}

const FONT = "font-family:Arial,Helvetica,sans-serif";
const MUTED = '#6b7280';

/** "www.padaria.pt" (o que se mostra de um endereço). */
export function signatureSiteLabel(website: string): string {
  return website.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** "https://padaria.pt" a partir do que o utilizador escreveu. */
export function signatureSiteHref(website: string): string {
  const text = website.trim();
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

/**
 * Telefone em formato de link (tel:+351912345678). Um número português de 9
 * dígitos leva o indicativo +351 (para funcionar fora do país).
 */
export function signaturePhoneHref(phone: string): string {
  const raw = phone.trim();
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  else if (/^[23689]\d{8}$/.test(digits)) digits = `+351${digits}`;
  return `tel:${digits}`;
}

/**
 * O HTML da assinatura (tabelas e estilos em linha: é o que os programas de
 * email percebem). Sai pronto a colar.
 */
export function clientSignatureHtml(input: ClientSignatureInput): string {
  const color = /^#[0-9a-f]{3,8}$/i.test(input.color ?? '') ? input.color! : '#141414';
  const line = (content: string) => `<tr><td style="${FONT};font-size:13px;line-height:20px;color:${MUTED};padding:0">${content}</td></tr>`;
  const link = (href: string, text: string) =>
    `<a href="${escapeHtml(href)}" style="color:${color};text-decoration:none">${escapeHtml(text)}</a>`;

  const rows = [
    `<tr><td style="${FONT};font-size:15px;font-weight:bold;line-height:22px;color:${color};padding:0">${escapeHtml(input.name)}</td></tr>`,
    input.role || input.company
      ? line(`${input.role ? escapeHtml(input.role) : ''}${input.role && input.company ? ' · ' : ''}${input.company ? `<strong style="color:#141414">${escapeHtml(input.company)}</strong>` : ''}`)
      : '',
    input.phone ? line(link(signaturePhoneHref(input.phone), input.phone)) : '',
    input.email ? line(link(`mailto:${input.email}`, input.email)) : '',
    input.website ? line(link(signatureSiteHref(input.website), signatureSiteLabel(input.website))) : '',
    input.address ? line(escapeHtml(input.address)) : '',
  ]
    .filter(Boolean)
    .join('');
  const text = `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tbody>${rows}</tbody></table>`;

  if (!input.logo) return `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tbody><tr><td style="padding:0">${text}</td></tr></tbody></table>`;

  const img = `<img src="${escapeHtml(input.logo.src)}" alt="${escapeHtml(input.company)}" width="${input.logo.width}" style="display:block;width:${input.logo.width}px;max-width:100%;height:auto;border:0">`;
  if ((input.layout ?? 'lado') === 'baixo') {
    return [
      `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tbody>`,
      `<tr><td style="padding:0 0 10px 0">${img}</td></tr>`,
      `<tr><td style="padding:0;border-top:2px solid ${color}"></td></tr>`,
      `<tr><td style="padding:10px 0 0 0">${text}</td></tr>`,
      `</tbody></table>`,
    ].join('');
  }
  return [
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tbody><tr>`,
    `<td style="padding:0 14px 0 0;vertical-align:middle">${img}</td>`,
    `<td style="padding:0 0 0 14px;vertical-align:middle;border-left:2px solid ${color}">${text}</td>`,
    `</tr></tbody></table>`,
  ].join('');
}

/** A mesma assinatura em texto simples (para quem escreve emails sem formatação). */
export function clientSignatureText(input: ClientSignatureInput): string {
  return [
    input.name,
    [input.role, input.company].filter(Boolean).join(' · '),
    input.phone,
    input.email,
    input.website ? signatureSiteLabel(input.website) : null,
    input.address,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Um ficheiro .html completo, para guardar ou abrir e copiar de lá. */
export function clientSignatureFile(input: ClientSignatureInput): string {
  return [
    '<!doctype html>',
    '<html lang="pt-PT"><head><meta charset="utf-8"><title>Assinatura de email</title></head>',
    '<body style="margin:24px;background:#ffffff">',
    clientSignatureHtml(input),
    '</body></html>',
  ].join('\n');
}
