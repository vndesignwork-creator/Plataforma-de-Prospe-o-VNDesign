import { describe, expect, it } from 'vitest';
import { hasVariantB, pickTemplateVariant } from '../src/templates';

const t = { name: 'Primeiro contacto', subject: 'Ideia para a {{empresa}}', body: '<p>Olá A</p>', subject_b: null, body_b: '<p>Olá B</p>' };

describe('modelos A/B', () => {
  it('sem versão B fica tal como está', () => {
    expect(pickTemplateVariant({ ...t, body_b: null }, { number: 3 })).toEqual({ name: 'Primeiro contacto', subject: t.subject, body: t.body, variant: null });
    expect(hasVariantB({ body_b: '<p> </p>' })).toBe(false);
  });
  it('alterna pelo número do lead e marca o nome', () => {
    expect(pickTemplateVariant(t, { number: 4 })).toMatchObject({ name: 'Primeiro contacto (A)', body: '<p>Olá A</p>', variant: 'A' });
    const b = pickTemplateVariant(t, { number: 7 });
    expect(b).toMatchObject({ name: 'Primeiro contacto (B)', body: '<p>Olá B</p>', variant: 'B' });
    // Sem assunto B, usa o mesmo assunto.
    expect(b.subject).toBe(t.subject);
    expect(pickTemplateVariant({ ...t, subject_b: 'Outro assunto' }, { number: 7 }).subject).toBe('Outro assunto');
  });
});
