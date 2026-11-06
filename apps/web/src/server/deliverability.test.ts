import { describe, expect, it } from 'vitest';
import { checkDeliverability, type TxtResolver } from './deliverability';

const notFound = () => Promise.reject(Object.assign(new Error('nf'), { code: 'ENOTFOUND' }));
function resolver(records: Record<string, string[]>, mx: string[] = ['mx1.hostinger.com']): TxtResolver {
  return {
    resolveTxt: (name) => (records[name] ? Promise.resolve(records[name]!.map((r) => [r])) : notFound()),
    resolveMx: () => Promise.resolve(mx.map((exchange, priority) => ({ exchange, priority }))),
  };
}

describe('checkDeliverability', () => {
  it('tudo certo (Hostinger)', async () => {
    const r = await checkDeliverability(
      'ola@vndesign.pt',
      { smtpHost: 'smtp.hostinger.com', provider: 'hostinger' },
      resolver({
        'vndesign.pt': ['v=spf1 include:_spf.mail.hostinger.com ~all', 'google-site-verification=x'],
        '_dmarc.vndesign.pt': ['v=DMARC1; p=quarantine; rua=mailto:ola@vndesign.pt'],
        'hostingermail-a._domainkey.vndesign.pt': ['v=DKIM1; k=rsa; p=MIGf'],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.checks.map((c) => [c.key, c.status])).toEqual([
      ['spf', 'ok'],
      ['dkim', 'ok'],
      ['dmarc', 'ok'],
      ['mx', 'ok'],
    ]);
  });

  it('sem SPF nem DMARC: diz o registo a acrescentar', async () => {
    const r = await checkDeliverability('ola@cliente.pt', { smtpHost: 'smtp.hostinger.com', provider: 'hostinger' }, resolver({}));
    expect(r.status).toBe('fail');
    const spf = r.checks.find((c) => c.key === 'spf')!;
    expect(spf.status).toBe('fail');
    expect(spf.record).toEqual({ type: 'TXT', name: '@', value: 'v=spf1 include:_spf.mail.hostinger.com ~all' });
    const dmarc = r.checks.find((c) => c.key === 'dmarc')!;
    expect(dmarc.status).toBe('warn');
    expect(dmarc.record?.value).toBe('v=DMARC1; p=none; rua=mailto:ola@cliente.pt');
    expect(r.checks.find((c) => c.key === 'dkim')!.status).toBe('warn');
  });

  it('SPF sem o servidor de envio, dois SPF e +all', async () => {
    const missing = await checkDeliverability('a@x.pt', { smtpHost: 'smtp.hostinger.com' }, resolver({ 'x.pt': ['v=spf1 include:_spf.google.com ~all'] }));
    const spf = missing.checks.find((c) => c.key === 'spf')!;
    expect(spf.status).toBe('warn');
    expect(spf.record?.value).toBe('v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all');
    const two = await checkDeliverability('a@x.pt', {}, resolver({ 'x.pt': ['v=spf1 ~all', 'v=spf1 include:a ~all'] }));
    expect(two.checks.find((c) => c.key === 'spf')!.summary).toMatch(/2 registos SPF/);
    const plus = await checkDeliverability('a@x.pt', {}, resolver({ 'x.pt': ['v=spf1 +all'] }));
    expect(plus.checks.find((c) => c.key === 'spf')!.record?.value).toBe('v=spf1 ~all');
  });

  it('seletor DKIM indicado à mão', async () => {
    const r = await checkDeliverability('a@x.pt', { selector: 'meu2024' }, resolver({ 'x.pt': ['v=spf1 ~all'], 'meu2024._domainkey.x.pt': ['v=DKIM1; p=abc'] }));
    expect(r.checks.find((c) => c.key === 'dkim')!.summary).toContain('"meu2024"');
  });

  it('Gmail: não há nada a configurar', async () => {
    const r = await checkDeliverability('alguem@gmail.com', {}, resolver({}));
    expect(r.managed).toBe(true);
    expect(r.status).toBe('ok');
  });

  it('DNS sem resposta: "não foi possível" (nunca um falso alarme)', async () => {
    const down: TxtResolver = {
      resolveTxt: () => Promise.reject(Object.assign(new Error('t'), { code: 'ETIMEOUT' })),
      resolveMx: () => Promise.reject(Object.assign(new Error('t'), { code: 'ETIMEOUT' })),
    };
    const r = await checkDeliverability('a@x.pt', {}, down);
    expect(r.status).toBe('unknown');
    expect(r.checks.every((c) => c.status === 'unknown')).toBe(true);
  });
});
