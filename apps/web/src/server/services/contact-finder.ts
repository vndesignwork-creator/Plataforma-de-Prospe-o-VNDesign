/**
 * Procurar o contacto de um lead: lê o site e a página de contactos (com a
 * mesma proteção da análise de sites) e, com GOOGLE_PLACES_API_KEY, o Google
 * Maps. Devolve só o que ainda não está no lead; nada é guardado sem escolha.
 */
import { isSocialUrl, pageContacts, phoneKey, textPhones, type ContactFindings } from '@vndesign/core';
import { safeGet } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { getLead } from './leads';
import { lookupPlace } from './share';

type Page = { url: string; body: string };

async function fetchPage(url: string): Promise<Page | null> {
  try {
    const page = await safeGet(url, { timeoutMs: 10_000, maxBytes: 1_500_000 });
    return page.status < 400 ? { url: page.url, body: page.body } : null;
  } catch {
    return null;
  }
}

/** Links para a página de contactos no próprio site (até 2). */
function contactLinks(page: Page): string[] {
  const base = new URL(page.url);
  const links = new Set<string>();
  for (const m of page.body.slice(0, 400_000).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const [, href = '', text = ''] = m;
    if (!/conta(c)?t|contact|fale|onde-estamos|localiza/i.test(`${href} ${text}`)) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname === base.hostname && /^https?:$/.test(url.protocol) && url.toString() !== page.url) links.add(url.toString());
    } catch {
      // Link inválido: ignora.
    }
    if (links.size >= 2) break;
  }
  return [...links];
}

export async function findLeadContacts(ctx: ApiContext, leadId: string): Promise<ContactFindings> {
  const lead = await getLead(ctx, leadId);
  const phones: string[] = [];
  const emails: string[] = [];
  const sources: string[] = [];
  let website: string | null = null;

  const collect = (body: string) => {
    const found = pageContacts(body);
    phones.push(...found.phones, ...textPhones(body));
    emails.push(...found.emails);
  };

  const place = await lookupPlace([lead.company_name, lead.city].filter(Boolean).join(' '));
  if (place) {
    sources.push('Google Maps');
    if (place.phone) phones.push(place.phone);
    if (place.website && !lead.website) website = place.website;
  }

  const site = lead.website && !isSocialUrl(lead.website) ? lead.website : website && !isSocialUrl(website) ? website : null;
  if (site) {
    const home = await fetchPage(site);
    if (home) {
      sources.push('site');
      collect(home.body);
      let pages = contactLinks(home);
      if (!pages.length) pages = ['/contactos', '/contacto', '/contact'].map((p) => new URL(p, home.url).toString());
      for (const url of pages.slice(0, 3)) {
        const page = await fetchPage(url);
        if (!page) continue;
        if (!sources.includes('página de contactos')) sources.push('página de contactos');
        collect(page.body);
      }
    }
  }

  // Só o que é novo para este lead (e sem repetidos).
  const known = new Set(lead.phone ? [phoneKey(lead.phone)] : []);
  const newPhones = [...new Map(phones.map((p) => [phoneKey(p), p])).entries()].filter(([k]) => k.length >= 9 && !known.has(k)).map(([, p]) => p);
  const newEmails = [...new Set(emails.map((e) => e.toLowerCase()))].filter((e) => e !== lead.email?.toLowerCase());
  return { phones: newPhones.slice(0, 6), emails: newEmails.slice(0, 6), website, sources };
}
