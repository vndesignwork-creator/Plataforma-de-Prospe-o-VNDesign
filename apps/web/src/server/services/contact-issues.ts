/**
 * Leads → Contactos a corrigir: emails que voltaram para trás ou de domínios que não recebem
 * emails, telefones mal escritos e o mesmo telefone em leads diferentes.
 */
import { isGenericEmailDomain, phoneKey, phoneProblem, splitPhones, tidyEmail, tidyPhoneField, type ContactFormatChange, type ContactIssue, type ContactIssues } from '@vndesign/core';
import type { ApiContext } from '../context';
import { checkEmailDomain } from '../email-check';
import { fromPostgrest } from '../http';

type Row = { id: string; number: number; company_name: string; email: string | null; phone: string | null; email_bounced_at: string | null; client_of: string | null };

/** Domínios verificados de cada vez (o DNS demora; os restantes ficam em cache para a próxima). */
const DOMAINS_PER_RUN = 150;

export async function contactIssues(ctx: ApiContext): Promise<ContactIssues> {
  const rows: Row[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await ctx.supabase
      .from('leads')
      .select('id, number, company_name, email, phone, email_bounced_at, client_of')
      .eq('workspace_id', ctx.workspaceId)
      .is('anonymized_at', null)
      .is('archived_at', null)
      .or('email.not.is.null,phone.not.is.null')
      .order('number')
      .range(from, from + 999);
    if (error) throw fromPostgrest(error);
    rows.push(...((data ?? []) as Row[]));
    if ((data?.length ?? 0) < 1000) break;
  }

  const issues = new Map<string, ContactIssue[]>();
  const add = (id: string, issue: ContactIssue) => issues.set(id, [...(issues.get(id) ?? []), issue]);

  // Emails: voltou para trás, ou o domínio não existe / não recebe emails.
  const domainOf = (email: string) => email.trim().toLowerCase().split('@')[1] ?? '';
  const domains = [...new Set(rows.filter((r) => r.email && !r.email_bounced_at).map((r) => domainOf(r.email!)).filter((d) => d && !isGenericEmailDomain(d)))];
  const toCheck = domains.slice(0, DOMAINS_PER_RUN);
  const results = new Map<string, Awaited<ReturnType<typeof checkEmailDomain>>>();
  for (let i = 0; i < toCheck.length; i += 15) {
    await Promise.all(toCheck.slice(i, i + 15).map(async (d) => results.set(d, await checkEmailDomain(`x@${d}`))));
  }
  for (const r of rows) {
    if (!r.email) continue;
    if (r.email_bounced_at) {
      add(r.id, { kind: 'email_bounced', field: 'email', message: 'O último email voltou para trás (o endereço não existe ou a caixa está cheia).' });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) {
      add(r.id, { kind: 'email_invalid', field: 'email', message: 'O email está mal escrito.' });
      continue;
    }
    const check = results.get(domainOf(r.email));
    if (check?.status === 'invalid') add(r.id, { kind: 'email_invalid', field: 'email', message: 'O email está mal escrito.' });
    else if (check?.status === 'no_domain') add(r.id, { kind: 'email_domain', field: 'email', message: `O domínio ${check.domain} não existe.` });
    else if (check?.status === 'no_mail') add(r.id, { kind: 'email_domain', field: 'email', message: `O domínio ${check.domain} não recebe emails.` });
  }

  // Telefones: mal escritos, e o mesmo número em leads diferentes (os projetos do mesmo cliente não contam).
  const byPhone = new Map<string, Row[]>();
  for (const r of rows) {
    for (const p of splitPhones(r.phone)) {
      const problem = phoneProblem(p);
      if (problem) {
        add(r.id, { kind: 'phone_invalid', field: 'phone', message: `${p}: ${problem}.` });
        continue;
      }
      const key = phoneKey(p);
      if (key.length >= 9) byPhone.set(key, [...(byPhone.get(key) ?? []), r]);
    }
  }
  for (const list of byPhone.values()) {
    const families = new Map<string, Row>();
    for (const r of list) families.set(r.client_of ?? r.id, families.get(r.client_of ?? r.id) ?? r);
    if (families.size < 2) continue;
    const people = [...families.values()];
    for (const r of people) {
      const other = people.find((o) => o.id !== r.id)!;
      add(r.id, {
        kind: 'phone_shared',
        field: 'phone',
        message: `O mesmo telefone que #${other.number} ${other.company_name}${people.length > 2 ? ` (e mais ${people.length - 2})` : ''}.`,
        other: { id: other.id, number: other.number, company_name: other.company_name },
      });
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    leads: [...issues.entries()]
      .map(([id, list]) => {
        const r = byId.get(id)!;
        return { lead: { id: r.id, number: r.number, company_name: r.company_name, email: r.email, phone: r.phone }, issues: list };
      })
      .sort((a, b) => b.lead.number - a.lead.number),
    domains_checked: toCheck.length,
    domains_pending: Math.max(0, domains.length - toCheck.length),
  };
}

/** "Arrumar formatos": o que mudaria (telefones como +351 912 345 678, emails em minúsculas). */
export async function contactFormatChanges(ctx: ApiContext): Promise<ContactFormatChange[]> {
  const out: ContactFormatChange[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await ctx.supabase
      .from('leads')
      .select('id, number, company_name, email, phone')
      .eq('workspace_id', ctx.workspaceId)
      .is('anonymized_at', null)
      .or('email.not.is.null,phone.not.is.null')
      .order('number')
      .range(from, from + 999);
    if (error) throw fromPostgrest(error);
    for (const r of (data ?? []) as Pick<Row, 'id' | 'number' | 'company_name' | 'email' | 'phone'>[]) {
      const phone = tidyPhoneField(r.phone);
      if (phone) out.push({ id: r.id, number: r.number, company_name: r.company_name, field: 'phone', from: r.phone!, to: phone });
      const email = tidyEmail(r.email);
      if (email) out.push({ id: r.id, number: r.number, company_name: r.company_name, field: 'email', from: r.email!, to: email });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

/** Grava os telefones e emails indicados (o "Arrumar formatos" e o "Anular"). */
export async function applyContactFormat(ctx: ApiContext, items: { id: string; phone?: string | null; email?: string | null }[]): Promise<number> {
  let changed = 0;
  for (let i = 0; i < items.length; i += 20) {
    const results = await Promise.all(
      items.slice(i, i + 20).map((item) => {
        const patch: Record<string, string | null> = {};
        if (item.phone !== undefined) patch.phone = item.phone || null;
        if (item.email !== undefined) patch.email = item.email || null;
        if (!Object.keys(patch).length) return Promise.resolve(0);
        return ctx.supabase
          .from('leads')
          .update(patch)
          .eq('workspace_id', ctx.workspaceId)
          .eq('id', item.id)
          .select('id')
          .then(({ data, error }) => {
            if (error) throw fromPostgrest(error);
            return data?.length ?? 0;
          });
      }),
    );
    changed += results.reduce((a, b) => a + b, 0);
  }
  return changed;
}
