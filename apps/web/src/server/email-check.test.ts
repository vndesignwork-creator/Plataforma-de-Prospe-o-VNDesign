import { describe, expect, it } from 'vitest';
import { checkEmailDomain, type Resolver } from './email-check';

const fail = (code: string) => Promise.reject(Object.assign(new Error(code), { code }));
const resolver = (mx: Record<string, string[] | string>, a: Record<string, boolean> = {}): Resolver => ({
  resolveMx: (d) => (Array.isArray(mx[d]) ? Promise.resolve(mx[d] as string[]) : fail((mx[d] as string) ?? 'ENOTFOUND')),
  resolve4: (d) => (a[d] ? Promise.resolve(['1.2.3.4']) : fail('ENOTFOUND')),
});

describe('verificar o email (MX)', () => {
  it('formato inválido e domínios conhecidos', async () => {
    expect(await checkEmailDomain('sem-arroba', resolver({}))).toEqual({ status: 'invalid', domain: null });
    expect(await checkEmailDomain('ana@gmail.com', resolver({}))).toEqual({ status: 'ok', domain: 'gmail.com' });
  });
  it('com MX ou só com um endereço: recebe', async () => {
    expect((await checkEmailDomain('geral@tasca-a.pt', resolver({ 'tasca-a.pt': ['mx1'] }))).status).toBe('ok');
    expect((await checkEmailDomain('geral@tasca-b.pt', resolver({ 'tasca-b.pt': 'ENODATA' }, { 'tasca-b.pt': true }))).status).toBe('ok');
  });
  it('domínio que não existe / sem email (com o DNS a responder)', async () => {
    const r = resolver({ 'gmail.com': ['mx'], 'tasca-c.pt': 'ENODATA' });
    expect((await checkEmailDomain('geral@nao-existe-x.pt', r)).status).toBe('no_domain');
    expect((await checkEmailDomain('geral@tasca-c.pt', r)).status).toBe('no_mail');
  });
  it('sem DNS (ou erro): não se sabe, não avisa', async () => {
    expect((await checkEmailDomain('geral@tasca-d.pt', resolver({}))).status).toBe('unknown');
    expect((await checkEmailDomain('geral@tasca-e.pt', resolver({ 'tasca-e.pt': 'ESERVFAIL' }))).status).toBe('unknown');
  });
});
