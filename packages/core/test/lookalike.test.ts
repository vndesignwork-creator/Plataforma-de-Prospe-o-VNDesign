import { expect, it } from 'vitest';
import { lookalikeSuggestions } from '../src/lookalike';

it('parecidos com os meus clientes: agrupa por setor e cidade, os maiores primeiro', () => {
  const rest = { id: 's1', name: 'Restauração' };
  const saude = { id: 's2', name: 'Saúde' };
  const out = lookalikeSuggestions([
    { company_name: 'Tasca A', city: 'Amadora', sector: rest, services: ['site'] },
    { company_name: 'Tasca B', city: 'amadora', sector: rest, services: ['site', 'geo'] },
    { company_name: 'Clínica C', city: 'Sintra', sector: saude, services: ['site'] },
    { company_name: 'Sem nada', city: null, sector: null },
  ]);
  expect(out).toHaveLength(2);
  expect(out[0]).toMatchObject({ sector_id: 's1', city: 'Amadora', clients: 2, services: ['site', 'geo'], examples: ['Tasca A', 'Tasca B'] });
  expect(out[0]!.query).toContain('restauração em Amadora');
  expect(out[1]!.sector_name).toBe('Saúde');
});
