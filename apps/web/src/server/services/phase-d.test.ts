import type { Lead, Today, TodayTask } from '@vndesign/core';
import { describe, expect, it } from 'vitest';
import { appendProblems } from './audits';
import { buildDigestEmail } from './digest';
import { buildDailyPush } from './push';

const lead = (id: string, company_name: string, number = 4) => ({ id, number, company_name }) as Lead;
const today = (overdue: Lead[], due_today: Lead[]): Today => ({ today: '2026-10-09', overdue, due_today, upcoming: [] });

describe('appendProblems', () => {
  it('junta sem repetir (ignora maiúsculas)', () => {
    expect(appendProblems('Sem HTTPS; site lento', 'sem https; Não é responsivo')).toBe('Sem HTTPS; site lento; Não é responsivo');
    expect(appendProblems(null, 'Sem HTTPS')).toBe('Sem HTTPS');
    expect(appendProblems('Linha 1\nLinha 2', 'Linha 2')).toBe('Linha 1; Linha 2');
  });
});

describe('buildDailyPush', () => {
  it('nada para hoje → sem notificação', () => {
    expect(buildDailyPush(today([], []))).toBeNull();
  });

  it('um só follow-up abre o lead', () => {
    expect(buildDailyPush(today([], [lead('a', 'Clínica Sá')]))).toEqual({
      title: '1 follow-up à tua espera',
      body: '1 para hoje — Clínica Sá',
      url: '/leads/4-clinica-sa',
      tag: 'daily-follow-ups',
    });
  });

  it('vários abrem o dashboard e resumem os nomes', () => {
    const p = buildDailyPush(today([lead('a', 'A'), lead('b', 'B')], [lead('c', 'C'), lead('d', 'D')]))!;
    expect(p.title).toBe('4 follow-ups à tua espera');
    expect(p.body).toBe('2 em atraso · 2 para hoje — A, B, C…');
    expect(p.url).toBe('/dashboard');
  });
});

const task = (id: string, title: string, due_on: string, leadId = 'l1', company = 'Café Central'): TodayTask => ({
  id,
  lead_id: leadId,
  title,
  due_on,
  done_at: null,
  position: 1,
  created_at: '',
  updated_at: '',
  lead: { id: leadId, number: 7, company_name: company, status: 'cliente' },
});

describe('tarefas no aviso e no resumo diário', () => {
  const withTasks = (tasks: TodayTask[]): Today => ({
    ...today([], []),
    tasks: {
      overdue: tasks.filter((t) => t.due_on! < '2026-10-09'),
      due_today: tasks.filter((t) => t.due_on === '2026-10-09'),
      upcoming: tasks.filter((t) => t.due_on! > '2026-10-09'),
    },
  });

  it('só tarefas: avisa e abre o lead quando são todas do mesmo', () => {
    const p = buildDailyPush(withTasks([task('t1', 'Enviar maquete', '2026-10-09'), task('t2', 'Pedir fotos', '2026-10-08')]))!;
    expect(p.title).toBe('2 tarefas para hoje');
    expect(p.body).toBe('2 tarefas — Café Central');
    expect(p.url).toBe('/leads/7-cafe-central');
  });

  it('tarefas só da semana não geram aviso', () => {
    expect(buildDailyPush(withTasks([task('t1', 'Publicar site', '2026-10-12')]))).toBeNull();
  });

  it('o resumo por email lista as tarefas com o lead', () => {
    const email = buildDigestEmail({
      workspaceName: 'VNDesign',
      today: withTasks([task('t1', 'Enviar maquete', '2026-10-09')]),
      appUrl: 'https://leads.vndesign.pt',
    });
    expect(email.subject).toContain('1 tarefa para hoje');
    expect(email.text).toContain('- Enviar maquete — #7 Café Central (09/10/2026) https://leads.vndesign.pt/leads/7-cafe-central');
    expect(email.html).toContain('Tarefas (1)');
  });
});
