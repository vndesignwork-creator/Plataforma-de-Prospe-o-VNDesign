import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkSite } from './site-monitors';

/*
 * Um site que responde 502 ao servidor da plataforma, mas que o Google (PageSpeed) abre:
 * está no ar. Se o Google também não o abrir, fica em baixo.
 */
let site: http.Server;
let google: http.Server;
let siteUrl = '';
let googleOpens = true;
const env = { ...process.env };

beforeAll(async () => {
  site = http.createServer((_req, res) => {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end('<h1>502 Bad Gateway</h1>');
  });
  google = http.createServer((_req, res) => {
    res.writeHead(googleOpens ? 200 : 500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        googleOpens
          ? { lighthouseResult: { categories: { performance: { score: 0.75 } }, audits: {} } }
          : { error: { message: 'Lighthouse returned error: ERRORED_DOCUMENT_REQUEST (Status code: 502)' } },
      ),
    );
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
  process.env.AUDIT_ALLOW_PRIVATE = '1';
  process.env.PAGESPEED_ENDPOINT = `http://127.0.0.1:${(google.address() as AddressInfo).port}/`;
  delete process.env.AUDIT_SKIP_PAGESPEED;
});

afterAll(() => {
  site.close();
  google.close();
  process.env = env;
});

describe('vigiar sites: segunda opinião do Google', () => {
  it('502 só para nós e o Google abre o site: está no ar', async () => {
    googleOpens = true;
    const check = await checkSite(siteUrl);
    expect(check).toMatchObject({ ok: true, error: null, status_code: 502 });
  }, 20_000);

  it('502 também para o Google: em baixo', async () => {
    googleOpens = false;
    const check = await checkSite(siteUrl.replace('127.0.0.1', 'localhost'));
    expect(check.ok).toBe(false);
    expect(check.error).toContain('502');
  }, 20_000);
});
