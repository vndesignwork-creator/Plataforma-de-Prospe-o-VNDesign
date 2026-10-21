import { describe, expect, it } from 'vitest';
import { planNextFollowUp, rankTemplatesForLead, replySubject } from '../src/templates';

const settings = {
  follow_up_days: 3,
  follow_up_sequence: { enabled: true, steps: [{ days: 3 }, { days: 7 }, { days: 14 }] },
};

describe('sequência de follow-ups', () => {
  it('depois do primeiro email: follow-up 1 daqui a 3 dias', () => {
    expect(planNextFollowUp(settings, 0, '2026-10-20')).toEqual({ on: '2026-10-23', text: 'Follow-up 1 de 3 por email', step: 1, total: 3 });
  });
  it('depois do 1.º follow-up: o 2.º daqui a 7 dias', () => {
    expect(planNextFollowUp(settings, 1, '2026-10-23')).toMatchObject({ on: '2026-10-30', step: 2, text: 'Follow-up 2 de 3 por email' });
  });
  it('depois do último: decidir (ligar ou sem interesse)', () => {
    expect(planNextFollowUp(settings, 3, '2026-11-13')).toMatchObject({ on: '2026-11-20', step: null });
    expect(planNextFollowUp(settings, 3, '2026-11-13').text).toContain('Sem resposta');
  });
  it('sequência desligada: o follow-up simples de N dias', () => {
    const off = { ...settings, follow_up_sequence: { ...settings.follow_up_sequence, enabled: false } };
    expect(planNextFollowUp(off, 1, '2026-10-20')).toEqual({ on: '2026-10-23', text: 'Enviar follow-up', step: null, total: 0 });
  });
  it('"Re:" sem repetir', () => {
    expect(replySubject('Uma ideia para a Pastelaria')).toBe('Re: Uma ideia para a Pastelaria');
    expect(replySubject('RE: Re: Uma ideia')).toBe('Re: Uma ideia');
    expect(replySubject('')).toBe('');
  });
  it('modelo mais adequado: categoria, setor e predefinido', () => {
    const t = (id: string, category: string | null, sector_id: string | null, is_default = false) => ({ id, category, sector_id, is_default });
    const list = [t('outra', 'grafico', null, true), t('generico', null, null), t('web', 'web', null), t('web-setor', 'web', 's1')];
    expect(rankTemplatesForLead(list, { sector_id: 's1' }, 'web').map((x) => x.id)).toEqual(['web-setor', 'web', 'generico', 'outra']);
    expect(rankTemplatesForLead(list, { sector_id: null }, null)[0]!.id).toBe('outra');
  });
});
