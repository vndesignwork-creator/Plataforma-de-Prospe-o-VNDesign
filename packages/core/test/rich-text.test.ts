import { describe, expect, it } from 'vitest';
import { emailBodyHtml, isRichHtml, richToPlainText, sanitizeRichHtml, textToRichHtml, toPlainText, toRichHtml } from '../src';

describe('texto formatado dos emails', () => {
  it('limpa o HTML: só as etiquetas do editor, sem scripts nem atributos perigosos', () => {
    expect(sanitizeRichHtml('<p onclick="x()">Olá <b>Rita</b><script>alert(1)</script></p><img src=x onerror=alert(1)>')).toBe('<p>Olá <b>Rita</b></p>');
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a> <a href="https://vndesign.pt/?a=1&b=2" target="_blank">site</a>')).toBe(
      '<a>x</a> <a href="https://vndesign.pt/?a=1&amp;b=2">site</a>',
    );
    expect(sanitizeRichHtml('<div style="text-align: center; color:red">Centro</div><span style="font-size:40px">grande</span>')).toBe(
      '<div style="text-align:center">Centro</div>grande',
    );
  });
  it('texto simples ↔ HTML do editor', () => {
    expect(isRichHtml('Olá,\n\nTudo bem?')).toBe(false);
    expect(textToRichHtml('Olá,\n\nVeja https://vndesign.pt.\nObrigado')).toBe(
      '<p>Olá,</p><p>Veja <a href="https://vndesign.pt">https://vndesign.pt</a>.<br>Obrigado</p>',
    );
    expect(toRichHtml('<p>já <b>formatado</b></p>')).toBe('<p>já <b>formatado</b></p>');
  });
  it('HTML → texto simples (WhatsApp, abrir no email, exportar)', () => {
    const html = '<p>Olá <b>Ana</b>,</p><ul><li>Site</li><li>Logótipo</li></ul><ol><li>Um</li><li>Dois</li></ol><p>Veja o <a href="https://vndesign.pt">portefólio</a> &amp; diga.</p>';
    expect(richToPlainText(html)).toBe('Olá Ana,\n\n- Site\n- Logótipo\n\n1. Um\n2. Dois\n\nVeja o portefólio (https://vndesign.pt) & diga.');
    expect(toPlainText('Só texto')).toBe('Só texto');
  });
  it('HTML do email enviado: espaçamento como nos emails em texto', () => {
    expect(emailBodyHtml('<p>Olá</p><ul><li>a</li></ul>')).toBe('<p style="margin:0 0 1em">Olá</p><ul style="margin:0 0 1em;padding-left:24px"><li>a</li></ul>');
    expect(emailBodyHtml('Olá\n\nAdeus')).toBe('<p style="margin:0 0 1em">Olá</p>\n<p style="margin:0 0 1em">Adeus</p>');
  });
});
