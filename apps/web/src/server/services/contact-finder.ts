/**
 * Procurar o contacto de um lead: lê o site e a página de contactos (com a
 * mesma proteção da análise de sites) e, com GOOGLE_PLACES_API_KEY, o Google
 * Maps. Devolve só o que ainda não está no lead; nada é guardado sem escolha.
 */
import { formatSharedPhone, isSocialUrl, pageContacts, phoneKey, textPhones, type BulkFindContactsResult, type ContactFindings } from '@vndesign/core';
import { safeGet } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { getLead, updateLead } from './leads';
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

/**
 * Procurar contactos em lote: para cada lead sem telefone ou sem email (ou com o
 * email devolvido), procura e guarda o primeiro que encontrar (e o site, se faltar).
 * Quatro de cada vez; um que falhe não para os outros.
 */
export async function findContactsBulk(ctx: ApiContext, ids: string[]): Promise<BulkFindContactsResult> {
  const result: BulkFindContactsResult = { checked: 0, updated: 0, phones: 0, emails: 0, websites: 0, skipped: 0, failed: 0 };
  const queue = [...new Set(ids)];
  const work = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const lead = await getLead(ctx, id);
        const needsEmail = !lead.email || !!lead.email_bounced_at;
        if (lead.anonymized_at || (lead.phone && !needsEmail)) {
          result.skipped++;
          continue;
        }
        result.checked++;
        const found = await findLeadContacts(ctx, id);
        const patch: { phone?: string; email?: string; website?: string } = {};
        if (!lead.phone && found.phones[0]) patch.phone = formatSharedPhone(found.phones[0]);
        if (needsEmail && found.emails[0] && found.emails[0].toLowerCase() !== lead.email?.toLowerCase()) patch.email = found.emails[0];
        if (!lead.website && found.website) patch.website = found.website;
        if (!Object.keys(patch).length) continue;
        await updateLead(ctx, id, patch);
        result.updated++;
        if (patch.phone) result.phones++;
        if (patch.email) result.emails++;
        if (patch.website) result.websites++;
      } catch (error) {
        result.failed++;
        console.warn('[procurar contactos] lead', id, error instanceof Error ? error.message : error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, work));
  return result;
}
