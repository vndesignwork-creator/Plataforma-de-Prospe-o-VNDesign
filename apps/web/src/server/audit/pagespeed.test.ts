import { describe, expect, it } from 'vitest';
import { PAGESPEED_SSL_BLOCKED, pageSpeedErrorMessage } from './pagespeed';

describe('erros do PageSpeed em português', () => {
  it('certificado inválido: explica que o Google não abre o site', () => {
    expect(pageSpeedErrorMessage('Lighthouse returned error: INSECURE_DOCUMENT_REQUEST. The URL you have provided does not have a valid security certificate.')).toBe(
      PAGESPEED_SSL_BLOCKED,
    );
  });
  it('página que não abre: diz as causas prováveis, sem o texto técnico', () => {
    const msg = pageSpeedErrorMessage('Lighthouse returned error: FAILED_DOCUMENT_REQUEST. Lighthouse was unable to reliably load the page you requested.');
    expect(msg).toContain('O Google não conseguiu abrir o site');
    expect(msg).not.toContain('Lighthouse');
  });
  it('outros erros: mantém o detalhe (curto)', () => {
    expect(pageSpeedErrorMessage('HTTP 500')).toBe('O PageSpeed não conseguiu analisar o site (HTTP 500).');
  });
});
