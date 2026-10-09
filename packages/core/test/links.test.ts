import { describe, expect, it } from 'vitest';
import { fixDirectoryWebsite, isDirectoryUrl, isSocialUrl } from '../src/links';

describe('links', () => {
  it.each([
    ['https://www.sluurpy.com/pt/cabanas/restaurant/2', true],
    ['sluurpy.pt/lisboa/x', true],
    ['https://wanderlog.com/list/geoCategory/37054', true],
    ['https://pt.tripadvisor.pt/Restaurant_Review', true],
    ['https://www.google.com/maps/place/x', true],
    ['https://maps.app.goo.gl/abc', true],
    ['https://www.facebook.com/olagar', false],
    ['https://olagar.pt', false],
    ['oquintal.mdig.pt', false],
  ])('diretório? %s → %s', (url, expected) => {
    expect(isDirectoryUrl(url)).toBe(expected);
  });

  it('redes sociais', () => {
    expect(isSocialUrl('https://m.facebook.com/x')).toBe(true);
    expect(isSocialUrl('https://olagar.pt')).toBe(false);
  });

  it('fixDirectoryWebsite', () => {
    expect(fixDirectoryWebsite({ website: 'https://olagar.pt' })).toBeNull();
    expect(fixDirectoryWebsite({ website: 'https://sluurpy.com/a', source_url: null })).toEqual({ website: null, source_url: 'https://sluurpy.com/a' });
    expect(fixDirectoryWebsite({ website: 'https://sluurpy.com/a', source_url: 'https://www.sluurpy.com/a/' })).toEqual({ website: null });
    expect(fixDirectoryWebsite({ website: 'https://sluurpy.com/a', source_url: 'https://wanderlog.com/b', notes: 'Nota' })).toEqual({
      website: null,
      notes: 'Nota\nLink de diretório: https://sluurpy.com/a',
    });
  });
});
