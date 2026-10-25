/**
 * Verificar um email antes de enviar: o domínio existe e recebe emails (MX ou,
 * na falta dele, um endereço)? Só avisa; nada é bloqueado. Se o próprio DNS
 * não responder (ex.: sem rede), o resultado é "unknown" — nunca um falso alarme.
 */
import { promises as dns } from 'node:dns';
import { isGenericEmailDomain, type EmailCheck } from '@vndesign/core';

export interface Resolver {
  resolveMx(domain: string): Promise<unknown[]>;
  resolve4(domain: string): Promise<unknown[]>;
}

const TIMEOUT_MS = 4000;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; result: EmailCheck }>();

const timeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), TIMEOUT_MS))]);

const missing = (e: unknown) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes((e as { code?: string }).code ?? '');

export async function checkEmailDomain(email: string, resolver: Resolver = dns): Promise<EmailCheck> {
  const address = email.trim().toLowerCase();
  const domain = /^[^\s@]+@([a-z0-9-]+(\.[a-z0-9-]+)+)$/.exec(address)?.[1];
  if (!domain) return { status: 'invalid', domain: null };
  // Gmail, Hotmail, Sapo…: recebem sempre.
  if (isGenericEmailDomain(domain)) return { status: 'ok', domain };
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  let result: EmailCheck;
  try {
    const mx = await timeout(resolver.resolveMx(domain));
    result = { status: mx.length ? 'ok' : 'no_mail', domain };
  } catch (error) {
    if (!missing(error)) {
      result = { status: 'unknown', domain };
    } else {
      // Sem MX: um endereço do domínio também pode receber emails.
      const address4 = await timeout(resolver.resolve4(domain)).then(
        (a) => a.length > 0,
        () => false,
      );
      if (address4) {
        result = { status: 'ok', domain };
      } else {
        // O DNS responde? (um domínio que existe de certeza; senão não se sabe nada.)
        const dnsWorks = await timeout(resolver.resolveMx('gmail.com')).then(
          (r) => r.length > 0,
          () => false,
        );
        result = { status: dnsWorks ? ((error as { code?: string }).code === 'ENODATA' ? 'no_mail' : 'no_domain') : 'unknown', domain };
      }
    }
  }
  if (result.status !== 'unknown') cache.set(domain, { at: Date.now(), result });
  return result;
}
