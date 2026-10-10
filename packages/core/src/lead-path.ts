/**
 * Endereços amigáveis das fichas: /leads/13-o-quintal (o "#" do lead + o nome).
 * O que conta é o número (único por workspace); o nome é só para se ler, por
 * isso mudar o nome da empresa não estraga links antigos. O id interno (UUID)
 * continua a ser aceite (redireciona para o endereço amigável).
 */
import { slugify } from './normalize';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "13-o-quintal" (nome cortado em 60 caracteres; sem nome legível fica só "13"). */
export function leadSlug(lead: { number: number; company_name: string }): string {
  const name = slugify(lead.company_name).slice(0, 60).replace(/-+$/, '');
  return name ? `${lead.number}-${name}` : String(lead.number);
}

/** "/leads/13-o-quintal" (+ "/editar", "/propostas/nova"…). */
export function leadPath(lead: { number: number; company_name: string }, sub = ''): string {
  return `/leads/${leadSlug(lead)}${sub}`;
}

/** Lê o segmento do endereço: id interno ou número (com ou sem nome à frente). */
export function parseLeadRef(ref: string): { id: string } | { number: number } | null {
  const value = decodeURIComponent(ref).trim();
  if (UUID_RE.test(value)) return { id: value.toLowerCase() };
  const m = /^(\d{1,9})(?:-|$)/.exec(value);
  if (!m) return null;
  const number = Number(m[1]);
  return number > 0 ? { number } : null;
}
