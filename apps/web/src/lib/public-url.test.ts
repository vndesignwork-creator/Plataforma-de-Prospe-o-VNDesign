import { afterEach, describe, expect, it } from 'vitest';
import { publicOrigin } from './public-url';

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

describe('publicOrigin', () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  it('usa APP_URL quando definido (o pedido chega como 0.0.0.0 atrás do proxy)', () => {
    process.env.APP_URL = 'https://leads.vndesign.pt/';
    expect(publicOrigin(req('http://0.0.0.0:3000/auth/signout'))).toBe('https://leads.vndesign.pt');
  });

  it('sem APP_URL usa os cabeçalhos do proxy', () => {
    const r = req('http://0.0.0.0:3000/x', { 'x-forwarded-host': 'leads.vndesign.pt', 'x-forwarded-proto': 'https' });
    expect(publicOrigin(r)).toBe('https://leads.vndesign.pt');
  });

  it('em desenvolvimento fica o endereço do pedido', () => {
    expect(publicOrigin(req('http://localhost:3000/x', { host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });
});
