import { describe, expect, it } from 'vitest';
import { WORKING_RECENT_HOURS, workingOnPicks, type Project } from '../src';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function project(id: string, opts: { due?: string | null; touch?: string | null } = {}): Project {
  return {
    lead: { id, company_name: id } as unknown as Project['lead'],
    info: { stage: 'briefing', due_on: opts.due ?? null } as unknown as Project['info'],
    tasks: { total: 0, done: 0 },
    next_task: null,
    payments: {} as Project['payments'],
    revisions: { used: 0 },
    time: { minutes: 0, logged_seconds: 0, running_since: null },
    deliverables: { total: 0, approved: 0 },
    value: null,
    expenses: 0,
    last_touch: opts.touch ?? null,
  };
}

describe('a trabalhar agora', () => {
  const a = project('a', { due: '2026-12-20', touch: hoursAgo(1) });
  const b = project('b', { due: '2026-11-21' });
  const c = project('c', { due: '2026-11-30', touch: hoursAgo(5) });

  it('o fixado à mão vem primeiro e o do temporizador a seguir', () => {
    const picks = workingOnPicks([a, b, c], { pinned: 'b', runningLeadId: 'c', now: NOW });
    expect(picks.map((p) => p.project.lead.id)).toEqual(['b', 'c', 'a']);
    expect(picks.map((p) => p.reason)).toEqual(['fixado', 'temporizador', 'recente']);
  });

  it('são três cartões no máximo, pela ordem', () => {
    const d = project('d', { due: '2026-11-25' });
    expect(workingOnPicks([a, b, c, d], { now: NOW })).toHaveLength(3);
  });

  it('sem fixado nem temporizador, manda aquele em que se mexeu há menos tempo', () => {
    const picks = workingOnPicks([a, b, c], { now: NOW });
    expect(picks.map((p) => p.project.lead.id)).toEqual(['a', 'c', 'b']);
    expect(picks.map((p) => p.reason)).toEqual(['recente', 'recente', 'prazo']);
  });

  it('sem nada mexido há pouco, volta ao prazo mais próximo', () => {
    const velho = project('d', { due: '2027-01-10', touch: hoursAgo(WORKING_RECENT_HOURS + 1) });
    const picks = workingOnPicks([velho, b], { now: NOW });
    expect(picks.map((p) => p.project.lead.id)).toEqual(['b', 'd']);
    expect(picks.every((p) => p.reason === 'prazo')).toBe(true);
  });

  it('nunca repete o mesmo projeto nem devolve mais do que o pedido', () => {
    const picks = workingOnPicks([a, b], { pinned: 'a', runningLeadId: 'a', now: NOW });
    expect(picks.map((p) => p.project.lead.id)).toEqual(['a', 'b']);
    expect(workingOnPicks([a, b, c], { now: NOW, count: 1 })).toHaveLength(1);
  });

  it('sem projetos, não devolve nada', () => {
    expect(workingOnPicks([], { pinned: 'a', runningLeadId: 'b', now: NOW })).toEqual([]);
  });
});
