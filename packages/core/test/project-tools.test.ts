import { describe, expect, it } from 'vitest';
import {
  CalendarQuerySchema,
  ProjectCompleteSchema,
  ProjectDeliverableCreateSchema,
  addMonths,
  dueStatus,
  entryMinutes,
  formatClock,
  formatMinutes,
  hourlyRate,
  monthGrid,
} from '../src/project-tools';

describe('prazo de entrega', () => {
  it('diz quanto falta ou quanto está atrasado', () => {
    expect(dueStatus(null, '2026-10-21')).toBeNull();
    expect(dueStatus('2026-10-26', '2026-10-21')).toEqual({ days: 5, label: 'Faltam 5 dias', tone: 'muted' });
    expect(dueStatus('2026-10-24', '2026-10-21')).toMatchObject({ label: 'Faltam 3 dias', tone: 'warning' });
    expect(dueStatus('2026-10-22', '2026-10-21')).toMatchObject({ label: 'Entrega amanhã', tone: 'warning' });
    expect(dueStatus('2026-10-21', '2026-10-21')).toMatchObject({ label: 'Entrega hoje', tone: 'warning' });
    expect(dueStatus('2026-10-20', '2026-10-21')).toEqual({ days: -1, label: 'Atrasado 1 dia', tone: 'danger' });
    // Atravessa a mudança de hora (25/10) sem erro de um dia.
    expect(dueStatus('2026-11-02', '2026-10-21')?.days).toBe(12);
  });
});

describe('registo de horas', () => {
  it('formata minutos, relógio e €/hora', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(125)).toBe('2 h 05 min');
    expect(formatClock(3909)).toBe('1:05:09');
    expect(hourlyRate(600, 600)).toBe(60);
    expect(hourlyRate(600, 10)).toBeNull();
    expect(hourlyRate(null, 600)).toBeNull();
  });

  it('conta os minutos (a contar: até agora)', () => {
    expect(entryMinutes({ started_at: '2026-10-21T10:00:00Z', ended_at: '2026-10-21T11:30:59Z' })).toBe(90);
    expect(entryMinutes({ started_at: '2026-10-21T10:00:00Z', ended_at: null }, Date.parse('2026-10-21T10:20:00Z'))).toBe(20);
  });
});

describe('entregas e conclusão', () => {
  it('links sem protocolo ganham https://', () => {
    expect(ProjectDeliverableCreateSchema.parse({ title: 'Logótipo', url: 'drive.google.com/x' })).toEqual({
      title: 'Logótipo',
      url: 'https://drive.google.com/x',
      status: 'rascunho',
    });
    expect(ProjectDeliverableCreateSchema.safeParse({ title: 'X', url: 'ftp://a' }).success).toBe(false);
  });

  it('concluir sem passos finais por omissão; meses somam no fim do mês', () => {
    expect(ProjectCompleteSchema.parse({ completed: true })).toEqual({ completed: true, portfolio_task: false, upsell_months: null });
    expect(addMonths('2026-10-21', 3)).toBe('2027-01-21');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });
});

describe('calendário', () => {
  it('grelha de segunda a domingo com semanas completas', () => {
    const days = monthGrid('2026-10'); // 1/10/2026 é quinta-feira
    expect(days[0]).toBe('2026-09-28');
    expect(days.at(-1)).toBe('2026-11-01');
    expect(days).toHaveLength(35);
  });

  it('intervalo máximo de 62 dias', () => {
    expect(CalendarQuerySchema.safeParse({ from: '2026-09-28', to: '2026-11-08' }).success).toBe(true);
    expect(CalendarQuerySchema.safeParse({ from: '2026-11-08', to: '2026-09-28' }).success).toBe(false);
    expect(CalendarQuerySchema.safeParse({ from: '2026-01-01', to: '2026-06-01' }).success).toBe(false);
  });
});

describe('valor do tempo ao valor por hora', () => {
  it('converte segundos em euros (ao cêntimo) e não converte sem valor por hora', async () => {
    const { timeValue } = await import('../src/project-tools');
    expect(timeValue(14 * 60 + 4, 35)).toBe(8.21);
    expect(timeValue(3600, 40)).toBe(40);
    expect(timeValue(0, 35)).toBe(0);
    expect(timeValue(3600, null)).toBeNull();
    expect(timeValue(3600, 0)).toBeNull();
  });
});
