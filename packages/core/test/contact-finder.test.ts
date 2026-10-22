import { describe, expect, it } from 'vitest';
import { contactSearchLinks, phoneKey, textPhones } from '../src';

describe('procurar contacto', () => {
  it('lê telefones escritos no texto, perto de "Telefone"/"Telemóvel" ou com +351', () => {
    const html = '<p>NIF 212345678</p><p>Telefone: 213 456 789</p><p>Telemóvel:<br>912.345.678</p><footer>+351 961 234 567</footer><p>Ref. 255123456</p>';
    expect(textPhones(html)).toEqual(['+351213456789', '+351912345678', '+351961234567']);
  });

  it('não confunde o NIF com um telefone (mesmo perto de "Contactos")', () => {
    expect(textPhones('<h1>Contactos</h1><p>NIF 212345678</p><p>NIPC: 512 345 678</p>')).toEqual([]);
  });

  it('ignora o que está em scripts e estilos', () => {
    expect(textPhones('<script>var tel = "Telefone: 213 456 789"</script>')).toEqual([]);
  });

  it('compara telefones com ou sem indicativo', () => {
    expect(phoneKey('+351 912 345 678')).toBe('912345678');
    expect(phoneKey('00351912345678')).toBe('912345678');
    expect(phoneKey('912 345 678')).toBe('912345678');
  });

  it('atalhos de pesquisa com o nome e a cidade', () => {
    const links = contactSearchLinks({ company_name: 'Cervejaria Bogotá', city: 'Amadora' });
    expect(links.map((l) => l.label)).toEqual(['Google', 'Google Maps', 'Facebook', 'Instagram']);
    expect(links[0]!.url).toBe('https://www.google.com/search?q=%22Cervejaria%20Bogot%C3%A1%22%20Amadora%20telefone');
    expect(links[1]!.url).toBe('https://www.google.com/maps/search/Cervejaria%20Bogot%C3%A1%20Amadora');
  });
});
