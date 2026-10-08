/**
 * Garante que a normalização em TypeScript dá o mesmo resultado que as funções
 * SQL (fonte de verdade da deteção de duplicados).
 * Só corre com uma base de dados disponível:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<publishable key> npm test
 */
import { describe, expect, it } from 'vitest';
import { emailBusinessDomain, normalizeCompanyName, normalizeEmail, websiteKey } from '../src/normalize';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

const NAMES = [
  'KUBRATECH, UNIPESSOAL, LDA',
  'MOBILITY 24, S.A.',
  'ELECTRO COLINA DO SOL - \nCOMÉRCIO E ASSISTÊNCIA \nA ELECTRODOMÉSTICOS, LDA',
  'Ventura’s Snack Bar',
  'Mineiro – Rodízio Brasileiro (Brandoa)',
  'Clínica Sá',
  'Construções Silva SA',
  'Assoalfra Associação de Solidariedade\nde Alfragide',
  'A Charrua da Quinta Grande',
  'Pão & Companhia, Lda.',
  '--',
];
const WEBSITES = [
  'http://www.ecs.com.pt/',
  'HTTPS://WWW.SFRAA.PT/sobre?x=1#topo',
  'sfraa.pt',
  'https://m.facebook.com/people/Brasa-do-Bairro/100043995408869/',
  'https://casquinha.eatbu.com/?lang=pt',
  'https://www.sluurpy.com/pt/alg%C3%A9s/restaurant/2209799/restaurante-a-casinha',
  'https://www.facebook.com/',
  '--',
];
const EMAILS = [' geral@aad.pt', 'Geral@SFRAA.pt ', 'a@x.pt; b@y.pt', 'oliveira@gmail.com', '--'];

describe.skipIf(!url || !key)('paridade TypeScript ↔ SQL', () => {
  it.each(NAMES)('vnd_normalize_company(%j)', async (name) => {
    expect(await rpc('vnd_normalize_company', { p: name })).toBe(normalizeCompanyName(name));
  });
  it.each(WEBSITES)('vnd_website_key(%j)', async (site) => {
    expect(await rpc('vnd_website_key', { p: site })).toBe(websiteKey(site));
  });
  it.each(EMAILS)('vnd_normalize_email(%j)', async (email) => {
    const normalized = await rpc('vnd_normalize_email', { p: email });
    expect(normalized).toBe(normalizeEmail(email));
    expect(await rpc('vnd_email_business_domain', { p_email: normalized })).toBe(emailBusinessDomain(email));
  });
});
