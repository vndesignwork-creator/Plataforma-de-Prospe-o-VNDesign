import { describe, expect, it } from 'vitest';
import { isUpdateError } from './app-version';

describe('erros de uma publicação nova', () => {
  it('reconhece ficheiros em falta e falhas de rede', () => {
    const chunk = new Error('Loading chunk 123 failed.');
    chunk.name = 'ChunkLoadError';
    expect(isUpdateError(chunk)).toBe(true);
    expect(isUpdateError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isUpdateError(new TypeError('Load failed'))).toBe(true);
    expect(isUpdateError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});
