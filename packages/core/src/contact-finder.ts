/**
 * Procurar o contacto de um lead sem telefone ou email: atalhos de pesquisa
 * (Google, Maps, Facebook, Instagram) e leitura automática do site e da página
 * de contactos (e do Google Maps, com GOOGLE_PLACES_API_KEY).
 */
import { z } from 'zod';

export const ContactFindingsSchema = z
  .object({
    phones: z.array(z.string()).meta({ description: 'Telefones encontrados (ainda não guardados no lead)' }),
    emails: z.array(z.string()),
    website: z.string().nullable().meta({ description: 'Site encontrado no Google Maps (se o lead não tiver)' }),
    sources: z.array(z.string()).meta({ description: 'Onde se procurou (ex.: "site", "página de contactos", "Google Maps")' }),
  })
  .meta({ id: 'ContactFindings' });
export type ContactFindings = z.infer<typeof ContactFindingsSchema>;

export interface SearchLink {
  key: 'google' | 'maps' | 'facebook' | 'instagram';
  label: string;
  url: string;
}

/** Atalhos de pesquisa já com o nome e a cidade do lead. */
export function contactSearchLinks(lead: { company_name: string; city?: string | null }): SearchLink[] {
  const name = lead.company_name.trim();
  const where = lead.city?.trim() ?? '';
  const q = (s: string) => encodeURIComponent(s.replace(/\s+/g, ' ').trim());
  return [
    { key: 'google', label: 'Google', url: `https://www.google.com/search?q=${q(`"${name}" ${where} telefone`)}` },
    { key: 'maps', label: 'Google Maps', url: `https://www.google.com/maps/search/${q(`${name} ${where}`)}` },
    { key: 'facebook', label: 'Facebook', url: `https://www.facebook.com/search/pages/?q=${q(`${name} ${where}`)}` },
    { key: 'instagram', label: 'Instagram', url: `https://www.google.com/search?q=${q(`site:instagram.com ${name} ${where}`)}` },
  ];
}

/**
 * Telefones portugueses escritos no texto (não só em links tel:), quando
 * aparecem perto de "tel", "telefone", "telemóvel", "contacto" ou +351 — para
 * não confundir com o NIF ou outros números de 9 dígitos.
 */
export function textPhones(html: string): string[] {
  const text = html
    .slice(0, 400_000)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ');
  const found = new Set<string>();
  const re = /(?:\+|00)?(351)?[\s.-]?\(?([29]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{3})(?!\d)/g;
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index).toLowerCase();
    // Logo antes: NIF, NIPC, contribuinte… não é telefone.
    if (/(nif|nipc|contribuinte|iban|capital|registo)\W{0,6}$/.test(before.trimEnd() + ' ')) continue;
    const near = /(tel|telef|telem|phone|contact|ligue|liga|📞|☎|whats)/.test(before) || !!m[1];
    if (!near) continue;
    found.add(`+351${m[2]}${m[3]}${m[4]}`);
  }
  return [...found];
}

/** Telefone sem espaços nem o +351, para comparar ("912 345 678" = "+351912345678"). */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('351') && digits.length === 12 ? digits.slice(3) : digits.startsWith('00351') ? digits.slice(5) : digits;
}
