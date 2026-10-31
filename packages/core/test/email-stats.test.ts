import { describe, expect, it } from 'vitest';
import { bestSlots, openHeatmap, slotLabel, statsByTemplate } from '../src';

describe('emails por modelo', () => {
  it('conta enviados, abertos, clicados e respostas (a resposta conta para o último email antes dela)', () => {
    const sent = [
      { lead_id: 'a', at: '2026-10-01T09:00:00Z', template: 'Email de prospeção', tracking_id: 't1' },
      { lead_id: 'a', at: '2026-10-05T09:00:00Z', template: 'Follow-up 1', tracking_id: 't2' },
      { lead_id: 'b', at: '2026-10-01T10:00:00Z', template: 'Email de prospeção', tracking_id: 't3' },
      { lead_id: 'c', at: '2026-10-01T10:00:00Z', template: null, tracking_id: null },
    ];
    const tracking = new Map([
      ['t1', { opens: 2, clicks: 1 }],
      ['t2', { opens: 1, clicks: 0 }],
      ['t3', { opens: 0, clicks: 0 }],
    ]);
    const replies = [
      { lead_id: 'a', at: '2026-10-06T08:00:00Z' }, // para o follow-up
      { lead_id: 'c', at: '2026-12-20T08:00:00Z' }, // mais de 30 dias: não conta
    ];
    expect(statsByTemplate(sent, tracking, replies)).toEqual([
      { template: 'Email de prospeção', sent: 2, tracked: 2, opened: 1, clicked: 1, replied: 0 },
      { template: 'Follow-up 1', sent: 1, tracked: 1, opened: 1, clicked: 0, replied: 1 },
      // Sem rastreio: não entra na base das aberturas.
      { template: null, sent: 1, tracked: 0, opened: 0, clicked: 0, replied: 0 },
    ]);
  });
});

describe('quando abrem', () => {
  it('mapa por dia e hora (Lisboa) e os melhores intervalos', () => {
    // Terça 27/10/2026 (hora de inverno: UTC = Lisboa): 9h, 9h, 10h; quinta 15h.
    const grid = openHeatmap(['2026-10-27T09:10:00Z', '2026-10-27T09:40:00Z', '2026-10-27T10:05:00Z', '2026-10-29T15:00:00Z']);
    expect(grid[1]![9]).toBe(2);
    expect(grid[1]![10]).toBe(1);
    expect(grid[3]![15]).toBe(1);
    const best = bestSlots(grid);
    expect(best[0]).toMatchObject({ weekday: 1, from_hour: 9, to_hour: 11, opens: 3 });
    expect(slotLabel(best[0]!)).toBe('terça entre as 9h e as 11h');
    expect(best.every((b) => b.opens >= 2)).toBe(true);
  });
});
