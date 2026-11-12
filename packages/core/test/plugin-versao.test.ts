import { describe, expect, it } from 'vitest';
import { freeAuditViewSite, isOlderVersion, wordpressPluginCaller } from '../src/free-audit';

describe('plugin de WordPress: versão e site', () => {
  it('compara versões como números', () => {
    expect(isOlderVersion('1.6.1', '1.9.0')).toBe(true);
    expect(isOlderVersion('1.9.0', '1.9.0')).toBe(false);
    expect(isOlderVersion('1.10.0', '1.9.0')).toBe(false);
    expect(isOlderVersion(null, '1.9.0')).toBe(true);
  });
  it('lê o site do User-Agent do WordPress e a versão do cabeçalho', () => {
    expect(wordpressPluginCaller('WordPress/6.8.1; https://VNDesign.pt/', '1.9.0')).toEqual({ site: 'https://vndesign.pt', version: '1.9.0' });
    expect(wordpressPluginCaller('WordPress/6.8.1; https://site.pt/blog', null)).toEqual({ site: 'https://site.pt/blog', version: null });
    expect(wordpressPluginCaller('Mozilla/5.0', '1.9.0')).toBeNull();
    expect(wordpressPluginCaller('WordPress/6.8; https://site.pt', 'x; drop')).toEqual({ site: 'https://site.pt', version: null });
  });
});

describe('freeAuditViewSite', () => {
  it('o site de uma página', () => {
    expect(freeAuditViewSite('https://www.Exemplo.pt/contactos?x=1')).toBe('exemplo.pt');
    expect(freeAuditViewSite('http://localhost:3000/analise/x')).toBe('localhost');
    expect(freeAuditViewSite('javascript:alert(1)')).toBeNull();
    expect(freeAuditViewSite('lixo')).toBeNull();
    expect(freeAuditViewSite(null)).toBeNull();
  });
});
