import { describe, expect, it } from 'vitest';
import { ProspectingSequenceSchema, WorkspaceSettingsSchema, parseSiteFormFields, planSequenceAdvance, sequenceStepText, siteFormSnippet } from '../src';

describe('formulário do site', () => {
  it('nomes de campo conhecidos (pt, en, Contact Form 7, Bricks)', () => {
    expect(parseSiteFormFields({ nome: 'Rui', email: 'RUI@Exemplo.pt', telefone: '912 345 678', mensagem: 'Quero um site', 'your-subject': 'Site' })).toEqual({
      name: 'Rui', email: 'rui@exemplo.pt', phone: '912 345 678', company: null, message: 'Quero um site', website: null, service: 'Site',
    });
    expect(parseSiteFormFields({ 'form-field-name': 'Ana', 'fields[email]': 'ana@x.pt' })).toMatchObject({ name: 'Ana', email: 'ana@x.pt' });
  });
  it('campos com nomes desconhecidos (ids do Bricks): pelo conteúdo; ignora internos', () => {
    const f = parseSiteFormFields({ abc123: 'Maria Silva', def456: 'maria@loja.pt', ghi789: '+351 913 000 111', jkl: 'Precisava de uma loja online para a minha pastelaria', _next: 'https://x.pt', 'g-recaptcha-response': 'zzz' });
    expect(f).toMatchObject({ name: 'Maria Silva', email: 'maria@loja.pt', phone: '+351 913 000 111', message: 'Precisava de uma loja online para a minha pastelaria' });
  });
  it('email inválido fica de fora; HTML pronto aponta para o endereço', () => {
    expect(parseSiteFormFields({ email: 'não é email' }).email).toBeNull();
    expect(siteFormSnippet('https://leads.vndesign.pt/api/v1/public/forms/abc')).toContain('action="https://leads.vndesign.pt/api/v1/public/forms/abc"');
    expect(WorkspaceSettingsSchema.parse({}).site_form.token).toBeNull();
  });
});

describe('sequência multicanal', () => {
  const seq = ProspectingSequenceSchema.parse({ enabled: true });
  it('sugestão: WhatsApp, email, ligar, email (desligada por omissão)', () => {
    expect(WorkspaceSettingsSchema.parse({}).prospecting_sequence.enabled).toBe(false);
    expect(seq.steps.map((s) => `${s.day}:${s.channel}`)).toEqual(['0:whatsapp', '3:email', '7:call', '14:email']);
    expect(sequenceStepText(seq, 1)).toBe('Passo 2 de 4: Email (dia 3)');
  });
  it('avança para o passo seguinte, na diferença de dias; no fim, tentar mais tarde', () => {
    expect(planSequenceAdvance(seq, 0, '2026-10-23')).toEqual({ step: 1, on: '2026-10-26', text: 'Passo 2 de 4: Email (dia 3)' });
    expect(planSequenceAdvance(seq, 2, '2026-10-30')).toEqual({ step: 3, on: '2026-11-06', text: 'Passo 4 de 4: Email (dia 14)' });
    expect(planSequenceAdvance(seq, 3, '2026-11-06')).toMatchObject({ step: 4, on: '2026-11-13' });
  });
  it('os dias têm de ir aumentando', () => {
    expect(ProspectingSequenceSchema.safeParse({ enabled: true, steps: [{ day: 3, channel: 'email' }, { day: 1, channel: 'call' }] }).success).toBe(false);
  });
});
