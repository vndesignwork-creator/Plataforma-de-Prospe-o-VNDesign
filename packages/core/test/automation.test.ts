import { describe, expect, it } from 'vitest';
import { AutomationRuleCreateSchema, describeAction, describeCondition, ruleMatches, ruleUsesTime, type RuleLead } from '../src/automation';

const lead = (over: Partial<RuleLead> = {}): RuleLead => ({
  website: null,
  email: 'ana@exemplo.pt',
  phone: null,
  status: 'contactado',
  sector_id: null,
  city: 'Amadora',
  channel: 'email',
  tags: ['Quente'],
  status_changed_at: '2026-10-01T10:00:00Z',
  ...over,
});
const now = new Date('2026-11-05T10:00:00Z');

describe('regras automáticas', () => {
  it('todas as condições têm de bater', () => {
    expect(ruleMatches([{ type: 'no_website' }, { type: 'status_in', values: ['contactado'] }], lead(), now)).toBe(true);
    expect(ruleMatches([{ type: 'no_website' }, { type: 'status_in', values: ['respondeu'] }], lead(), now)).toBe(false);
    expect(ruleMatches([], lead(), now)).toBe(false);
  });
  it('site, email, cidade (sem acentos/maiúsculas) e etiquetas', () => {
    expect(ruleMatches([{ type: 'has_website' }], lead({ website: 'https://x.pt' }), now)).toBe(true);
    expect(ruleMatches([{ type: 'no_email' }], lead({ email: '  ' }), now)).toBe(true);
    expect(ruleMatches([{ type: 'city_is', value: 'amadora' }], lead(), now)).toBe(true);
    expect(ruleMatches([{ type: 'has_tag', value: 'quente' }], lead(), now)).toBe(true);
    expect(ruleMatches([{ type: 'not_tag', value: 'Quente' }], lead(), now)).toBe(false);
  });
  it('parado na fase há N dias', () => {
    expect(ruleMatches([{ type: 'idle_days', days: 21 }], lead(), now)).toBe(true);
    expect(ruleMatches([{ type: 'idle_days', days: 60 }], lead(), now)).toBe(false);
    expect(ruleUsesTime([{ type: 'idle_days', days: 3 }])).toBe(true);
    expect(ruleUsesTime([{ type: 'no_website' }])).toBe(false);
  });
  it('descrições e validação', () => {
    expect(describeCondition({ type: 'idle_days', days: 21 })).toBe('Parado na fase há pelo menos 21 dias');
    expect(describeAction({ type: 'create_task', title: 'Ligar', due_in_days: 1 })).toBe('Criar a tarefa “Ligar” para amanhã');
    expect(AutomationRuleCreateSchema.safeParse({ name: 'X', conditions: [], actions: [{ type: 'add_tag', value: 'a' }] }).success).toBe(false);
  });
});
