import { describe, expect, it } from 'vitest';
import { getOpenApiDocument } from './openapi';

describe('OpenAPI', () => {
  it('gera o documento com todos os endpoints (falha se um schema não for documentável)', () => {
    const doc = getOpenApiDocument();
    const paths = Object.keys(doc.paths ?? {});
    expect(paths.length).toBeGreaterThanOrEqual(45);
    for (const p of ['/leads/import', '/leads/{id}/audits', '/leads/{id}/proposals', '/proposals/{id}/pdf', '/leads/{id}/ai-email', '/map']) {
      expect(paths).toContain(p);
    }
  });
});
