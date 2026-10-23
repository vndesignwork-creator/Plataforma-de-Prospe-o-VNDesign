import { describe, expect, it } from 'vitest';
import { TaskSearchQuerySchema, TimeEntryCreateSchema, projectMatches, sortProjects, timeByTask } from '../src';

const today = '2026-10-23';
const project = (id: string, due: string | null, extra: { overdue?: number; value?: number | null; stage?: 'briefing' | 'producao' | 'revisoes' | 'entrega' } = {}) => ({
  lead: { id } as never,
  info: { due_on: due, stage: extra.stage ?? 'producao' } as never,
  payments: { total: 0, paid: 0, outstanding: 0, overdue: extra.overdue ?? 0, overdue_count: 0 },
  value: extra.value ?? null,
});

describe('filtros e ordem dos Projetos', () => {
  const late = project('a', '2026-10-20');
  const week = project('b', '2026-10-29', { overdue: 150, value: 900 });
  const later = project('c', '2026-11-30', { value: 2000, stage: 'entrega' });
  const none = project('d', null, { stage: 'briefing' });

  it('atrasados, pagamentos em atraso e entregas desta semana', () => {
    expect([late, week, later, none].filter((p) => projectMatches(p, 'atrasados', today)).map((p) => (p.lead as { id: string }).id)).toEqual(['a']);
    expect([late, week, later, none].filter((p) => projectMatches(p, 'pagamentos', today)).map((p) => (p.lead as { id: string }).id)).toEqual(['b']);
    // Hoje até daqui a 6 dias (23 → 29).
    expect([late, week, later, none].filter((p) => projectMatches(p, 'semana', today)).map((p) => (p.lead as { id: string }).id)).toEqual(['b']);
    expect([late, week, later, none].filter((p) => projectMatches(p, 'todos', today))).toHaveLength(4);
  });

  it('ordenar por prazo (sem prazo no fim), valor e fase', () => {
    const ids = (list: { lead: unknown }[]) => list.map((p) => (p.lead as { id: string }).id);
    expect(ids(sortProjects([none, later, week, late], 'prazo'))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(sortProjects([none, later, week, late], 'valor'))).toEqual(['c', 'b', 'a', 'd']);
    expect(ids(sortProjects([none, later, week, late], 'fase'))).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('horas por tarefa', () => {
  const titles = new Map([
    ['t1', 'Página inicial'],
    ['t2', 'Logótipo'],
  ]);
  const entry = (task: string | null, minutes: number, open = false) => ({
    task_id: task,
    started_at: '2026-10-23T09:00:00Z',
    ended_at: open ? null : new Date(Date.parse('2026-10-23T09:00:00Z') + minutes * 60_000).toISOString(),
  });

  it('soma por tarefa, mais tempo primeiro e "Sem tarefa" no fim (tarefas apagadas também)', () => {
    expect(timeByTask([entry('t2', 30), entry(null, 90), entry('t1', 60), entry('t1', 45), entry('apagada', 15), entry('t2', 10, true)], titles)).toEqual([
      { task_id: 't1', title: 'Página inicial', seconds: 105 * 60 },
      { task_id: 't2', title: 'Logótipo', seconds: 30 * 60 },
      { task_id: null, title: 'Sem tarefa', seconds: 105 * 60 },
    ]);
  });

  it('registo à mão com tarefa (opcional)', () => {
    expect(TimeEntryCreateSchema.parse({ date: '2026-10-23', minutes: 30 }).task_id).toBeNull();
    expect(TimeEntryCreateSchema.safeParse({ date: '2026-10-23', minutes: 30, task_id: 'x' }).success).toBe(false);
  });
});

describe('pesquisa rápida', () => {
  it('pelo menos 2 letras', () => {
    expect(TaskSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(TaskSearchQuerySchema.parse({ q: ' logo ' })).toEqual({ q: 'logo', limit: 8 });
  });
});
