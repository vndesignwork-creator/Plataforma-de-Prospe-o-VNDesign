import dns from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditRequestError, assertAllowedUrl, isPrivateAddress, safeGet } from './safe-request';

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.20.0.5', true],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['::ffff:127.0.0.1', true],
    ['8.8.8.8', false],
    ['2a00:1450:4003:80f::2004', false],
    ['::ffff:8.8.8.8', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe('assertAllowedUrl', () => {
  const previous = process.env.AUDIT_ALLOW_PRIVATE;
  afterEach(() => {
    process.env.AUDIT_ALLOW_PRIVATE = previous;
  });

  it('recusa protocolos, portas e anfitriões internos', () => {
    delete process.env.AUDIT_ALLOW_PRIVATE;
    for (const url of [
      'ftp://exemplo.pt',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://localhost:3000/',
      'http://exemplo.pt:8080/',
      'http://user:pass@exemplo.pt/',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      expect(() => assertAllowedUrl(new URL(url)), url).toThrow(AuditRequestError);
    }
    expect(() => assertAllowedUrl(new URL('https://exemplo.pt/'))).not.toThrow();
  });

  it('não segue um domínio que resolve para um endereço interno', async () => {
    delete process.env.AUDIT_ALLOW_PRIVATE;
    // DNS "envenenado": um domínio público que aponta para a rede interna.
    const spy = vi.spyOn(dns, 'lookup').mockImplementation(((_host: string, _opts: unknown, cb: (...a: unknown[]) => void) =>
      cb(null, [{ address: '10.0.0.5', family: 4 }])) as unknown as typeof dns.lookup);
    await expect(safeGet('http://intranet.exemplo.pt/')).rejects.toMatchObject({ code: 'blocked' });
    spy.mockRestore();
  });
});
