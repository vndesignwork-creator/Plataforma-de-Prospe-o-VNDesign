import { describe, expect, it } from 'vitest';
import { colorCodes, extractPalette, qrFileName, qrPayload, rgbToCmyk } from '../src';

describe('códigos das cores', () => {
  it('HEX, RGB e CMYK', () => {
    expect(colorCodes('#ef5c32')).toEqual({ hex: '#EF5C32', rgb: '239, 92, 50', cmyk: '0, 62, 79, 6' });
    expect(colorCodes('fff')).toEqual({ hex: '#FFFFFF', rgb: '255, 255, 255', cmyk: '0, 0, 0, 0' });
    expect(rgbToCmyk(0, 0, 0)).toEqual([0, 0, 0, 100]);
    expect(colorCodes('nada')).toBeNull();
  });
});

describe('cores do logótipo', () => {
  const image = (parts: [number, number, number, number, number][]) => {
    const px: number[] = [];
    for (const [n, r, g, b, a] of parts) for (let i = 0; i < n; i++) px.push(r, g, b, a);
    return px;
  };
  it('as mais usadas primeiro; transparente, tons intermédios e o fundo branco ficam de fora', () => {
    const px = image([
      [6000, 255, 255, 255, 255], // fundo branco (30%)
      [8000, 239, 92, 50, 255], // laranja
      [4000, 20, 40, 90, 255], // azul-escuro
      [500, 236, 95, 55, 255], // anti-aliasing do laranja
      [3000, 0, 0, 0, 0], // transparente
    ]);
    const palette = extractPalette(px);
    expect(palette[0]).toMatch(/^#e[ef]5[cd]3[23]$/);
    expect(palette).toHaveLength(2);
  });
  it('vazio ou só transparente: nada', () => {
    expect(extractPalette([])).toEqual([]);
    expect(extractPalette(image([[100, 10, 10, 10, 0]]))).toEqual([]);
  });
});

describe('códigos QR', () => {
  it('site e avaliação levam https', () => {
    expect(qrPayload({ kind: 'url', value: 'padariasol.pt' })).toEqual({ text: 'https://padariasol.pt' });
    expect(qrPayload({ kind: 'review', value: '' })).toHaveProperty('error');
  });
  it('WhatsApp com mensagem', () => {
    expect(qrPayload({ kind: 'whatsapp', value: '912 345 678', message: 'Olá!' })).toEqual({ text: 'https://wa.me/351912345678?text=Ol%C3%A1!' });
    expect(qrPayload({ kind: 'whatsapp', value: '213 000 000' })).toHaveProperty('error');
  });
  it('Wi-Fi escapa os caracteres especiais', () => {
    expect(qrPayload({ kind: 'wifi', ssid: 'Café;Sol', password: 'a:b', security: 'WPA' })).toEqual({ text: 'WIFI:T:WPA;S:Café\\;Sol;P:a\\:b;;' });
    expect(qrPayload({ kind: 'wifi', ssid: 'Aberta', security: 'nopass' })).toEqual({ text: 'WIFI:T:nopass;S:Aberta;;' });
    expect(qrPayload({ kind: 'wifi', ssid: 'X' })).toHaveProperty('error');
  });
  it('nome do ficheiro', () => {
    expect(qrFileName('review', 'Padaria Sol, Lda.', 'png')).toBe('qr-avaliacao-padaria-sol-lda.png');
  });
});
