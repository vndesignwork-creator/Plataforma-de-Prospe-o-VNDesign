import { describe, expect, it } from 'vitest';
import { nextActionOrigin } from '../src/next-action';
import type { Activity } from '../src/schemas';

const act = (type: Activity['type'], created_at: string, payload: Record<string, unknown> = {}, token = false): Activity => ({
  id: crypto.randomUUID(),
  lead_id: '00000000-0000-4000-8000-000000000000',
  type,
  body: null,
  payload,
  actor_user_id: '11111111-1111-4111-8111-111111111111',
  actor_token_id: token ? '22222222-2222-4222-8222-222222222222' : null,
  created_at,
});

describe('nextActionOrigin', () => {
  it('sem data: nada', () => {
    expect(nextActionOrigin({ next_action_on: null }, [act('created', '2026-10-20T10:00:00Z', { source: 'import' })])).toBeNull();
  });

  it('a data veio com o lead: importação de folha ou API', () => {
    expect(nextActionOrigin({ next_action_on: '2026-10-26' }, [act('created', '2026-10-20T10:00:00Z', { source: 'import' })])?.kind).toBe('import');
    expect(nextActionOrigin({ next_action_on: '2026-10-26' }, [act('created', '2026-10-20T10:00:00Z', { source: 'import' }, true)])?.kind).toBe('api');
  });

  it('a mais recente que pôs aquela data ganha (adiar, editar)', () => {
    const list = [
      act('created', '2026-10-20T10:00:00Z', { source: 'import' }),
      act('follow_up_scheduled', '2026-10-22T09:00:00Z', { on: '2026-10-26', snoozed: true }),
      act('note', '2026-10-23T09:00:00Z'),
    ];
    expect(nextActionOrigin({ next_action_on: '2026-10-26' }, list)).toMatchObject({ kind: 'snoozed', at: '2026-10-22T09:00:00Z' });
    const edited = [...list, act('updated', '2026-10-24T09:00:00Z', { fields: ['next_action_on', 'next_action_text'] })];
    expect(nextActionOrigin({ next_action_on: '2026-10-26' }, edited)?.kind).toBe('edited');
  });

  it('um adiamento para outra data não conta', () => {
    const list = [act('created', '2026-10-20T10:00:00Z'), act('follow_up_scheduled', '2026-10-22T09:00:00Z', { on: '2026-10-30' })];
    expect(nextActionOrigin({ next_action_on: '2026-10-26' }, list)?.kind).toBe('created');
  });
});
