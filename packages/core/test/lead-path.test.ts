import { describe, expect, it } from 'vitest';
import { leadPath, leadSlug, parseLeadRef } from '../src/lead-path';

describe('endereços amigáveis dos leads', () => {
  it('número + nome sem acentos nem símbolos', () => {
    expect(leadSlug({ number: 13, company_name: 'O Quintal' })).toBe('13-o-quintal');
    expect(leadSlug({ number: 5, company_name: 'SFRAA – Sociedade Filarmónica' })).toBe('5-sfraa-sociedade-filarmonica');
    expect(leadSlug({ number: 7, company_name: '!!!' })).toBe('7');
    expect(leadPath({ number: 2, company_name: 'Casquinha do Mar' }, '/editar')).toBe('/leads/2-casquinha-do-mar/editar');
  });

  it('nomes compridos são cortados sem hífen no fim', () => {
    const slug = leadSlug({ number: 1, company_name: 'a'.repeat(59) + ' bbbbbb' });
    expect(slug.length).toBeLessThanOrEqual(62);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('lê o id interno, o número ou número-nome', () => {
    expect(parseLeadRef('82D2CF60-9A1E-4E58-8563-A300DA69CEA0')).toEqual({ id: '82d2cf60-9a1e-4e58-8563-a300da69cea0' });
    expect(parseLeadRef('13-o-quintal')).toEqual({ number: 13 });
    expect(parseLeadRef('13')).toEqual({ number: 13 });
    expect(parseLeadRef('13-nome%20antigo')).toEqual({ number: 13 });
    expect(parseLeadRef('o-quintal')).toBeNull();
    expect(parseLeadRef('0')).toBeNull();
    expect(parseLeadRef('13abc')).toBeNull();
  });
});
