import { describe, expect, it } from 'vitest';
import { formatDowntime, formatUptime, monthUtcRange, siteSlowdown, siteUptime, slowdownText, type SiteCheckPoint } from '../src/site-monitor';

const p = (at: string, down = false, ok = !down, ms: number | null = 500): SiteCheckPoint => ({ checked_at: at, ok, down, response_ms: ms });

describe('siteUptime', () => {
  const from = new Date('2026-10-01T00:00:00Z');
  const to = new Date('2026-10-02T00:00:00Z');

  it('sem quebras: 100%', () => {
    const r = siteUptime([p('2026-09-30T23:30:00Z'), p('2026-10-01T12:00:00Z')], from, to);
    expect(r.uptime_pct).toBe(100);
    expect(r.incidents).toEqual([]);
    expect(r.checks).toBe(1);
    expect(r.days).toEqual([{ day: '2026-10-01', uptime_pct: 100 }]);
  });

  it('uma quebra de 1 hora num dia: 95,8% e o incidente', () => {
    const r = siteUptime([p('2026-09-30T23:00:00Z'), p('2026-10-01T10:00:00Z', true), p('2026-10-01T11:00:00Z')], from, to);
    expect(r.down_minutes).toBe(60);
    expect(r.uptime_pct).toBe(95.8);
    expect(r.incidents).toEqual([{ start: '2026-10-01T10:00:00.000Z', end: '2026-10-01T11:00:00.000Z', minutes: 60 }]);
  });

  it('quase sempre no ar nunca aparece como 100%', () => {
    const r = siteUptime([p('2026-09-30T23:00:00Z'), p('2026-10-01T10:00:00Z', true), p('2026-10-01T10:00:30Z')], from, to);
    expect(r.uptime_pct).toBe(99.9);
  });

  it('antes de começar a vigiar não conta', () => {
    const r = siteUptime([p('2026-10-01T18:00:00Z')], from, to);
    expect(r.uptime_pct).toBe(100);
    expect(siteUptime([], from, to).uptime_pct).toBeNull();
  });

  it('uma falha só (a confirmar) não é quebra; o tempo de resposta é a média das que responderam', () => {
    const r = siteUptime([p('2026-10-01T01:00:00Z', false, false, null), p('2026-10-01T02:00:00Z', false, true, 300), p('2026-10-01T03:00:00Z', false, true, 700)], from, to);
    expect(r.uptime_pct).toBe(100);
    expect(r.avg_response_ms).toBe(500);
  });
});

describe('formatação', () => {
  it('percentagem e duração em pt-PT', () => {
    expect(formatUptime(99.9)).toBe('99,9%');
    expect(formatUptime(100)).toBe('100%');
    expect(formatDowntime(25)).toBe('25 min');
    expect(formatDowntime(85)).toBe('1 h 25 min');
    expect(formatDowntime(60 * 27)).toBe('1 dia 3 h');
  });
  it('mês', () => {
    expect(monthUtcRange('2026-10')).toEqual({ from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') });
    expect(monthUtcRange('2026-13')).toBeNull();
  });
});

describe('siteSlowdown', () => {
  const many = (ms: number, n = 30) => Array.from({ length: n }, () => ms);
  it('rápido: não avisa; poucas verificações: não decide', () => {
    expect(siteSlowdown(many(800), many(700)).slow).toBe(false);
    expect(siteSlowdown(many(5000, 10), []).slow).toBe(false);
  });
  it('lento e pior do que antes', () => {
    const r = siteSlowdown(many(4100), many(1200));
    expect(r).toMatchObject({ slow: true, worse: true, recent_ms: 4100, before_ms: 1200 });
    expect(slowdownText(r)).toBe('o site passou de 1,2 s para 4,1 s a responder (última semana)');
  });
  it('sempre lento: avisa, sem "piorou"; um pico isolado não conta', () => {
    const r = siteSlowdown(many(3500), many(3400));
    expect(r).toMatchObject({ slow: true, worse: false });
    expect(slowdownText(r)).toBe('o site demora 3,5 s a responder (última semana)');
    expect(siteSlowdown([...many(900, 29), 20_000], []).slow).toBe(false);
  });
});
