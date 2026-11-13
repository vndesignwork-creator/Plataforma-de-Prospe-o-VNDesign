import { describe, expect, it } from 'vitest';
import { phoneProblem, splitPhones, tidyEmail, tidyPhoneField } from '../src/contact-issues';

describe('phoneProblem', () => {
  it('números portugueses bons', () => {
    for (const p of ['912 345 678', '+351 213 456 789', '00351912345678', '(+351) 912-345-678', '808 200 200', '300 500 600']) expect(phoneProblem(p)).toBeNull();
  });
  it('dígitos a mais ou a menos e começo errado', () => {
    expect(phoneProblem('91234567')).toBe('tem 8 dígitos (um número português tem 9)');
    expect(phoneProblem('9123456789')).toBe('tem 10 dígitos (um número português tem 9)');
    expect(phoneProblem('512 345 678')).toBe('não começa por 2, 3, 7, 8 ou 9');
    expect(phoneProblem('ligar à tarde')).toBe('tem letras ou símbolos');
  });
  it('estrangeiros', () => {
    expect(phoneProblem('+34 912 345 678')).toBeNull();
    expect(phoneProblem('+44 20 7946 0958')).toBeNull();
    expect(phoneProblem('+34 123')).toBe('número estrangeiro com dígitos a menos ou a mais');
  });
  it('vários números no mesmo campo', () => {
    expect(splitPhones('912 345 678 / 213 456 789')).toEqual(['912 345 678', '213 456 789']);
    expect(splitPhones('912345678 ou 213456789')).toEqual(['912345678', '213456789']);
    expect(splitPhones('')).toEqual([]);
  });
});

describe('arrumar formatos', () => {
  it('telefones portugueses ficam como +351 912 345 678', () => {
    expect(tidyPhoneField('912345678')).toBe('+351 912 345 678');
    expect(tidyPhoneField('00351 213-456-789')).toBe('+351 213 456 789');
    expect(tidyPhoneField('912 345 678 / 213456789')).toBe('+351 912 345 678 / +351 213 456 789');
    expect(tidyPhoneField('+351 912 345 678')).toBeNull();
  });
  it('estrangeiros só perdem espaços a mais; com um número mal escrito não mexe', () => {
    expect(tidyPhoneField('+34  912 345 678')).toBe('+34 912 345 678');
    expect(tidyPhoneField('91234567')).toBeNull();
    expect(tidyPhoneField('912345678 / 123')).toBeNull();
  });
  it('emails em minúsculas e sem espaços', () => {
    expect(tidyEmail(' Geral@Empresa.PT ')).toBe('geral@empresa.pt');
    expect(tidyEmail('geral@empresa.pt')).toBeNull();
    expect(tidyEmail('lixo')).toBeNull();
  });
});
