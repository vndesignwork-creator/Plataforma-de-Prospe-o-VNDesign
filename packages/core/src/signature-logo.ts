/**
 * Logótipo da assinatura: vai embutido no email (anexo "inline", cid:) logo por
 * baixo da assinatura. Só entra quando a assinatura está no email — numa resposta
 * curta sem assinatura não aparece um logótipo solto.
 */

export const SIGNATURE_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif'] as const;
export const SIGNATURE_LOGO_MAX_BYTES = 1024 * 1024;
/** Tamanhos à escolha (largura no email, em píxeis). */
export const SIGNATURE_LOGO_SIZES = [
  { width: 120, label: 'Pequeno' },
  { width: 160, label: 'Médio' },
  { width: 220, label: 'Grande' },
] as const;
/** O browser guarda o logótipo com o dobro da largura maior (nítido em ecrãs de alta densidade). */
export const SIGNATURE_LOGO_STORE_WIDTH = 640;
export const SIGNATURE_LOGO_CID = 'logotipo-assinatura@vndesign-leads';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SignatureLogo {
  /** Endereço da imagem (no email: `cid:…`). */
  src: string;
  width: number;
  alt: string;
  /** Link ao clicar (o site da assinatura). */
  href?: string | null;
}

export function signatureLogoHtml(logo: SignatureLogo): string {
  const img = `<img src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.alt)}" width="${logo.width}" style="display:block;width:${logo.width}px;max-width:100%;height:auto;border:0">`;
  const href = logo.href && /^https?:\/\//i.test(logo.href) ? logo.href : null;
  // Numa linha própria, por baixo da última linha da assinatura (dentro do mesmo parágrafo).
  const box = 'display:inline-block;margin-top:12px';
  return `<br>${href ? `<a href="${escapeHtml(href)}" style="${box}">${img}</a>` : `<span style="${box}">${img}</span>`}`;
}

/**
 * Junta o logótipo a seguir à última linha da assinatura que aparece no email
 * (a mais abaixo). Devolve null quando a assinatura não está no email.
 */
export function addSignatureLogo(html: string, signatureText: string, logo: SignatureLogo): string | null {
  const lines = signatureText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  // Da última linha para a primeira: a assinatura pode ter sido encurtada no email.
  for (const line of [...lines].reverse()) {
    const needle = escapeHtml(line);
    // Só uma linha inteira (entre etiquetas: <br>, <p>…), não o nome a meio de uma frase.
    for (let at = html.lastIndexOf(needle); at !== -1; at = at > 0 ? html.lastIndexOf(needle, at - 1) : -1) {
      const end = at + needle.length;
      const before = html.slice(0, at).trimEnd();
      const after = html.slice(end).trimStart();
      if ((before === '' || before.endsWith('>')) && (after === '' || after.startsWith('<'))) {
        return `${html.slice(0, end)}${signatureLogoHtml(logo)}${html.slice(end)}`;
      }
    }
  }
  return null;
}
