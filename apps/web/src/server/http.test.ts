import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, fromPostgrest, zodFieldErrors } from './http';

describe('fromPostgrest', () => {
  const pg = (code: string, message = 'x') => ({ code, message, details: '', hint: '', name: 'PostgrestError' }) as never;

  it.each([
    ['PGRST116', 404],
    ['P0002', 404],
    ['22023', 400],
    ['23503', 400],
    ['23505', 409],
    ['42501', 403],
  ])('%s → %i', (code, status) => {
    const err = fromPostgrest(pg(code));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(status);
  });

  it('códigos desconhecidos → 500 sem expor a mensagem interna', () => {
    const err = fromPostgrest(pg('XX000', 'segredo interno'));
    expect(err.status).toBe(500);
    expect(err.detail).not.toContain('segredo');
  });
});

describe('zodFieldErrors', () => {
  it('agrupa mensagens por campo', () => {
    const r = z.object({ a: z.string().min(2, { error: 'curto' }), b: z.object({ c: z.number() }) }).safeParse({ a: 'x', b: { c: 'y' } });
    const errors = zodFieldErrors(r.error!);
    expect(errors.a).toEqual(['curto']);
    expect(Object.keys(errors)).toContain('b.c');
  });
});
