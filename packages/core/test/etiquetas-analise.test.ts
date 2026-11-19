import { describe, expect, it } from 'vitest';
import { AUTO_TAGS, AUTO_TAG_MAX, auditTags, mergeAuditTags } from '../src/audit-tags';
import type { AuditIssueCode } from '../src/audit';

const issues = (...codes: AuditIssueCode[]) => codes.map((code) => ({ code }));

describe('etiquetas a partir da análise', () => {
  it('põe a etiqueta de cada problema encontrado', () => {
    expect(auditTags(issues('no_https', 'no_viewport'))).toEqual(['site inseguro', 'sem telemóvel']);
  });

  it('"muito lento" ganha a "lento" (nunca entram as duas)', () => {
    expect(auditTags(issues('pagespeed_low', 'slow_lcp'))).toEqual(['site muito lento']);
    expect(auditTags(issues('slow_lcp'))).toEqual(['site lento']);
  });

  it('no máximo 4 etiquetas, pela ordem das regras', () => {
    const many = auditTags(issues('no_own_site', 'unreachable', 'no_https', 'no_viewport', 'pagespeed_low', 'outdated_copyright'));
    expect(many).toHaveLength(AUTO_TAG_MAX);
    expect(many[0]).toBe('sem site');
  });

  it('site sem problemas não ganha etiquetas', () => {
    expect(auditTags([])).toEqual([]);
  });
});

describe('juntar às etiquetas do lead', () => {
  it('mantém as etiquetas escritas à mão', () => {
    expect(mergeAuditTags(['feira de março'], ['site lento'])).toEqual(['feira de março', 'site lento']);
  });

  it('não repete', () => {
    expect(mergeAuditTags(['site lento'], ['site lento'])).toEqual(['site lento']);
  });

  it('tira as automáticas que já não se aplicam (o site foi arranjado)', () => {
    expect(mergeAuditTags(['site inseguro', 'urgente'], ['site lento'])).toEqual(['urgente', 'site lento']);
  });

  it('respeita o limite de etiquetas do lead', () => {
    const current = Array.from({ length: 10 }, (_, i) => `etiqueta ${i}`);
    expect(mergeAuditTags(current, ['site lento'])).toHaveLength(10);
    expect(mergeAuditTags(current, ['site lento'])).not.toContain('site lento');
  });

  it('as automáticas são todas conhecidas (para as poder tirar depois)', () => {
    expect(AUTO_TAGS).toContain('sem telemóvel');
    expect(new Set(AUTO_TAGS).size).toBe(AUTO_TAGS.length);
  });
});
