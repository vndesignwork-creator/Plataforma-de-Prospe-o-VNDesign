import { describe, expect, it } from 'vitest';
import {
  emailBusinessDomain,
  ensureUrlProtocol,
  isBlank,
  normalizeCompanyName,
  normalizeEmail,
  normalizeText,
  slugify,
  websiteKey,
} from '../src/normalize';

// Os mesmos casos são verificados contra as funções SQL em scripts/check-sql-parity.mjs
describe('normalizeCompanyName', () => {
  it.each([
    ['KUBRATECH, UNIPESSOAL, LDA', 'kubratech'],
    ['MOBILITY 24, S.A.', 'mobility 24'],
    [
      'ELECTRO COLINA DO SOL - \nCOMÉRCIO E ASSISTÊNCIA \nA ELECTRODOMÉSTICOS, LDA',
      'electro colina do sol comercio e assistencia a electrodomesticos',
    ],
    ['Ventura’s Snack Bar', 'ventura s snack bar'],
    ['Mineiro – Rodízio Brasileiro (Brandoa)', 'mineiro rodizio brasileiro brandoa'],
    ['Clínica Sá', 'clinica sa'],
    ['Construções Silva SA', 'construcoes silva'],
    ['Empresa X, Lda.', 'empresa x'],
    ['  ', null],
    ['--', null],
  ])('%j → %j', (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected);
  });

  it('ignora acentos e maiúsculas', () => {
    expect(normalizeCompanyName('Cervejaria Bogotá')).toBe(normalizeCompanyName('CERVEJARIA BOGOTA'));
  });
});

describe('websiteKey', () => {
  it.each([
    ['http://www.ecs.com.pt/', 'ecs.com.pt'],
    ['https://sfraa.pt/', 'sfraa.pt'],
    ['sfraa.pt', 'sfraa.pt'],
    ['HTTPS://WWW.SFRAA.PT/sobre?x=1#topo', 'sfraa.pt'],
    ['https://www.facebook.com/bogotacervejaria/', 'facebook.com/bogotacervejaria'],
    ['https://m.facebook.com/people/Brasa-do-Bairro/100043995408869/', 'facebook.com/people/brasa-do-bairro/100043995408869'],
    ['https://casquinha.eatbu.com/?lang=pt', 'casquinha.eatbu.com'],
    ['https://oquintal.mdig.pt/', 'oquintal.mdig.pt'],
    ['http://mineiro.com.pt/brandoa', 'mineiro.com.pt'],
    ['https://restaurantguru.com/Venturas-Snack-Bar-Amadora', 'restaurantguru.com/venturas-snack-bar-amadora'],
    ['https://www.facebook.com/', null],
    ['--', null],
    ['', null],
    ['localhost', null],
  ])('%j → %j', (input, expected) => {
    expect(websiteKey(input)).toBe(expected);
  });
});

describe('email', () => {
  it('normaliza e extrai o primeiro email', () => {
    expect(normalizeEmail(' geral@aad.pt')).toBe('geral@aad.pt');
    expect(normalizeEmail('Geral@SFRAA.pt ')).toBe('geral@sfraa.pt');
    expect(normalizeEmail('a@x.pt; b@y.pt')).toBe('a@x.pt');
    expect(normalizeEmail('--')).toBeNull();
  });

  it('domínio empresarial ignora fornecedores genéricos', () => {
    expect(emailBusinessDomain('geral@ecs.com.pt')).toBe('ecs.com.pt');
    expect(emailBusinessDomain('oliveiracarloscunha@gmail.com')).toBeNull();
    expect(emailBusinessDomain('alguem@sapo.pt')).toBeNull();
  });
});

describe('utilitários', () => {
  it('normalizeText', () => {
    expect(normalizeText('  Saúde   /  Clínica ')).toBe('saude / clinica');
    expect(normalizeText('')).toBeNull();
  });
  it('slugify', () => {
    expect(slugify('Educação & Formação')).toBe('educacao-formacao');
    expect(slugify('🏥 Saúde / Clínica')).toBe('saude-clinica');
  });
  it('ensureUrlProtocol', () => {
    expect(ensureUrlProtocol('vndesign.pt')).toBe('https://vndesign.pt');
    expect(ensureUrlProtocol('http://x.pt')).toBe('http://x.pt');
  });
  it('isBlank', () => {
    expect(isBlank('--')).toBe(true);
    expect(isBlank(' ')).toBe(true);
    expect(isBlank(0)).toBe(false);
  });
});
