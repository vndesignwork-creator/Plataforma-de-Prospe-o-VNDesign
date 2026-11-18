import { describe, expect, it } from 'vitest';
import { renderBrandManualPdf } from './brand-manual-pdf';

import { crc32, deflateSync } from 'node:zlib';

/** Um PNG verdadeiro de 2×2 (laranja), feito aqui. */
function png(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  const row = Buffer.from([0, 239, 92, 50, 239, 92, 50]);
  const raw = Buffer.concat([row, row]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png();

describe('manual de marca', () => {
  it('gera o PDF com logótipo, cores, tipos de letra e regras', async () => {
    const pdf = await renderBrandManualPdf({
      company: 'Padaria Sol',
      colors: [
        { name: 'Laranja', hex: '#ef5c32' },
        { name: '', hex: '#141414' },
      ],
      fonts: [{ name: 'Plus Jakarta Sans', usage: 'texto' }],
      logos: [{ name: 'logotipo.png', data: PNG, format: 'png' }],
      otherFiles: ['logotipo.svg'],
      preparedBy: { name: 'Va', company: 'VNDesign', email: null, website: 'https://vndesign.pt' },
      today: '2026-11-18',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
  }, 30_000);

  it('uma imagem estragada não prende o PDF: sai sem ela', async () => {
    const pdf = await renderBrandManualPdf(
      {
        company: 'Estragado',
        colors: [{ name: '', hex: '#000000' }],
        fonts: [],
        logos: [{ name: 'mau.png', data: Buffer.from('não é um png'), format: 'png' }],
        otherFiles: [],
        preparedBy: { name: 'Va', company: null, email: null, website: null },
        today: '2026-11-18',
      },
      3000,
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30_000);

  it('sem logótipos nem tipos de letra também sai', async () => {
    const pdf = await renderBrandManualPdf({
      company: 'Café Lua',
      colors: [{ name: 'Azul', hex: '#1d4ed8' }],
      fonts: [],
      logos: [],
      otherFiles: [],
      preparedBy: { name: 'Va', company: null, email: null, website: null },
      today: '2026-11-18',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30_000);
});
