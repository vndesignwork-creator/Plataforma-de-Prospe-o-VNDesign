import { describe, expect, it } from 'vitest';
import { parseTaskPhrase } from '../src/task-phrase';

// 2026-11-05 é quinta-feira.
const today = '2026-11-05';
const p = (s: string) => parseTaskPhrase(s, today);

describe('criar tarefa a escrever como se fala', () => {
  it('dia da semana e hora', () => {
    expect(p('Ligar à Clínica Sorriso sexta às 10h')).toMatchObject({
      title: 'Ligar à Clínica Sorriso',
      due_on: '2026-11-06',
      time: '10:00',
      leadHint: 'Clínica Sorriso',
    });
    // Hoje é quinta: "quinta" é a da semana que vem.
    expect(p('Reunião na quinta-feira').due_on).toBe('2026-11-12');
    expect(p('Enviar proposta na próxima segunda').due_on).toBe('2026-11-09');
  });

  it('hoje, amanhã, depois de amanhã, daqui a…', () => {
    expect(p('Rever textos amanhã')).toMatchObject({ title: 'Rever textos', due_on: '2026-11-06' });
    expect(p('Rever textos depois de amanhã').due_on).toBe('2026-11-07');
    expect(p('Pagar alojamento hoje às 18:30')).toMatchObject({ title: 'Pagar alojamento', due_on: today, time: '18:30' });
    expect(p('Follow-up daqui a 3 dias').due_on).toBe('2026-11-08');
    expect(p('Rever em duas semanas').due_on).toBe('2026-11-19');
    expect(p('Renovar domínio daqui a 1 mês').due_on).toBe('2026-12-05');
    expect(p('Planear para a semana').due_on).toBe('2026-11-09');
    expect(p('Faturas fim do mês').due_on).toBe('2026-11-30');
  });

  it('datas escritas', () => {
    expect(p('Entrega 15/11')).toMatchObject({ title: 'Entrega', due_on: '2026-11-15' });
    expect(p('Entrega até 15/11/2027').due_on).toBe('2027-11-15');
    // Sem ano e já passou: o ano que vem.
    expect(p('Aniversário 02/03').due_on).toBe('2027-03-02');
    expect(p('Contrato no dia 20').due_on).toBe('2026-11-20');
    expect(p('Contrato no dia 2').due_on).toBe('2026-12-02');
    expect(p('Lançamento a 3 de dezembro').due_on).toBe('2026-12-03');
  });

  it('só hora: é para hoje; nada reconhecido fica igual', () => {
    expect(p('Ligar ao Rui às 15h30')).toMatchObject({ title: 'Ligar ao Rui', due_on: today, time: '15:30', leadHint: 'Rui' });
    expect(p('Preparar maquete')).toMatchObject({ title: 'Preparar maquete', due_on: null, time: null, leadHint: null, matched: [] });
    expect(p('Pedir 3 fotografias').due_on).toBeNull();
    expect(p('Proposta #12 amanhã')).toMatchObject({ leadHint: '#12', due_on: '2026-11-06' });
  });
});
