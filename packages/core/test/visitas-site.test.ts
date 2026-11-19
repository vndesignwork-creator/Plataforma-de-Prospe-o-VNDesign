import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from '../src/enums';
import { WorkspaceSettingsSchema } from '../src/schemas';

describe('visitas ao site', () => {
  it('a atividade "Visitou o teu site" existe', () => {
    expect(ACTIVITY_TYPES).toContain('site_visit');
    expect(ACTIVITY_TYPE_LABELS.site_visit).toBe('Visitou o teu site');
  });

  it('vem ligada, e desliga-se nas definições', () => {
    expect(WorkspaceSettingsSchema.parse({}).features.site_visits).toBe(true);
    expect(WorkspaceSettingsSchema.parse({ features: { site_visits: false } }).features.site_visits).toBe(false);
  });
});
