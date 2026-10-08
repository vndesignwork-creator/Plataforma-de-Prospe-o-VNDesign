import { describe, expect, it } from 'vitest';
import { toQueryString } from './api-client';

describe('toQueryString', () => {
  it('ignora vazios e junta listas com vírgulas', () => {
    expect(toQueryString({ q: 'café', status: ['contactado', 'respondeu'], city: '', page: 2, x: undefined, y: [] })).toBe(
      '?q=caf%C3%A9&status=contactado%2Crespondeu&page=2',
    );
    expect(toQueryString({})).toBe('');
  });
});
