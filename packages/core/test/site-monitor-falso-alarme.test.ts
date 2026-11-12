import { describe, expect, it } from 'vitest';
import { FALSE_ALARM_DAYS, downMuted } from '../src/site-monitor';

describe('falso alarme na vigilância dos sites', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  it('silenciado só até à data marcada', () => {
    expect(downMuted({ down_muted_until: '2026-11-19T10:00:00Z' }, now)).toBe(true);
    expect(downMuted({ down_muted_until: '2026-11-12T09:59:59Z' }, now)).toBe(false);
    expect(downMuted({ down_muted_until: null }, now)).toBe(false);
    expect(downMuted({}, now)).toBe(false);
  });
  it('dura uma semana', () => {
    expect(FALSE_ALARM_DAYS).toBe(7);
  });
});
