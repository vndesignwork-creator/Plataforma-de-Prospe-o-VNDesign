import { describe, expect, it } from 'vitest';
import { emailBodyHtml } from '../src/rich-text';
import { addSignatureLogo, signatureLogoHtml } from '../src/signature-logo';
import { formatSignature } from '../src/templates';

const sig = formatSignature({ full_name: 'Ana Silva', role_title: 'Web Designer', company: 'VNDesign', phone: '912 345 678', website: 'https://vndesign.pt' });
const logo = { src: 'cid:logo', width: 160, alt: 'VNDesign', href: 'https://vndesign.pt' };

describe('addSignatureLogo', () => {
  it('em texto simples: logo a seguir à última linha da assinatura', () => {
    const html = emailBodyHtml(`Olá Rui,\n\nTenho uma ideia.\n\nCumprimentos,\n${sig}`);
    const out = addSignatureLogo(html, sig, logo)!;
    expect(out).toContain('912 345 678 · vndesign.pt<br><a href="https://vndesign.pt"');
    expect(out).toContain('src="cid:logo"');
    expect(out.indexOf('<img')).toBeGreaterThan(out.indexOf('Ana Silva'));
  });

  it('no HTML do editor e com a assinatura encurtada', () => {
    const html = '<p>Olá,</p><p>Até breve!</p><p>Ana Silva<br>Web Designer · VNDesign</p>';
    expect(addSignatureLogo(html, sig, logo)).toBe(`<p>Olá,</p><p>Até breve!</p><p>Ana Silva<br>Web Designer · VNDesign${signatureLogoHtml(logo)}</p>`);
  });

  it('sem assinatura no email (ou o nome só a meio de uma frase): sem logo', () => {
    expect(addSignatureLogo(emailBodyHtml('Obrigada pela resposta!'), sig, logo)).toBeNull();
    expect(addSignatureLogo(emailBodyHtml('Sou a Ana Silva da VNDesign.'), sig, logo)).toBeNull();
  });

  it('sem site: imagem sem link; o texto alternativo é escapado', () => {
    expect(signatureLogoHtml({ ...logo, href: null, alt: 'A & B' })).toMatch(/^<br><span [^>]*><img [^>]*alt="A &amp; B"/);
  });
});
