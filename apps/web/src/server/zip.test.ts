import { describe, expect, it } from 'vitest';
import { createZip, uniqueNames } from './zip';

describe('zip', () => {
  it('estrutura: um ficheiro por entrada, nomes em UTF-8 e o diretório no fim', () => {
    const zip = createZip([
      { name: 'Kit da marca/logótipo.png', data: Buffer.from('png') },
      { name: 'Leia-me.txt', data: 'olá' },
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    expect(zip.includes(Buffer.from('Kit da marca/logótipo.png', 'utf8'))).toBe(true);
  });

  it('nomes repetidos', () => {
    expect(uniqueNames(['a/logo.png', 'a/logo.png', 'a/LOGO.png', 'b'])).toEqual(['a/logo.png', 'a/logo (2).png', 'a/LOGO (3).png', 'b']);
  });
});
