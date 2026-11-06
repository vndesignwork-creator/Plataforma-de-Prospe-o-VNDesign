/**
 * Os emails chegam à caixa de entrada? Consulta o DNS do domínio de envio (SPF, DKIM,
 * DMARC e MX) e avalia com as regras do core. Sem resposta do DNS fica "não foi possível".
 */
import { promises as dns } from 'node:dns';
import { DKIM_SELECTORS, evaluateDeliverability, type DeliverabilityReport, type DnsAnswers } from '@vndesign/core';

export interface TxtResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>;
}

const TIMEOUT_MS = 5000;
const timeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), TIMEOUT_MS))]);
/** Não existe (resposta certa do DNS: não há registo). */
const absent = (e: unknown) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes((e as { code?: string }).code ?? '');

async function txt(resolver: TxtResolver, name: string): Promise<string[][] | null> {
  try {
    return await timeout(resolver.resolveTxt(name));
  } catch (error) {
    return absent(error) ? [] : null;
  }
}

export async function checkDeliverability(
  email: string,
  options: { smtpHost?: string | null; provider?: string | null; selector?: string | null } = {},
  resolver: TxtResolver = dns,
): Promise<DeliverabilityReport> {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const selectors = [...new Set([...(options.selector ? [options.selector] : []), ...DKIM_SELECTORS])];
  const [domainTxt, dmarcTxt, mx, dkimRows] = await Promise.all([
    txt(resolver, domain),
    txt(resolver, `_dmarc.${domain}`),
    timeout(resolver.resolveMx(domain)).then(
      (r) => r.sort((a, b) => a.priority - b.priority).map((m) => m.exchange),
      (e) => (absent(e) ? [] : null),
    ),
    Promise.all(selectors.map(async (s) => [s, await txt(resolver, `${s}._domainkey.${domain}`)] as const)),
  ]);
  const dkim: Record<string, string> = {};
  for (const [s, rows] of dkimRows) {
    const value = (rows ?? []).map((r) => r.join('')).find((v) => /v=DKIM1|p=/i.test(v));
    if (value) dkim[s] = value;
  }
  const answers: DnsAnswers = { domainTxt, dmarcTxt, dkim, mx, selectors };
  return evaluateDeliverability(email, answers, { smtpHost: options.smtpHost, provider: options.provider });
}
