import { describe, expect, it } from 'vitest';
import { IntegrationImportSchema, mapIntegrationLead } from '../src/integration';

const SECTORS = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Restauração', slug: 'restauracao' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Clínicas', slug: 'clinicas' },
];

describe('mapIntegrationLead', () => {
  it('converte o JSON da tarefa semanal', () => {
    const r = mapIntegrationLead(
      {
        company_name: '  Restaurante  O Lagar ',
        sector: '🍽️ Restauração',
        website: 'olagar.pt',
        city: 'Amadora',
        problems: 'Sem HTTPS',
        pagespeed: 34,
        mobile: 'Não',
        email: 'Geral@OLagar.pt',
        status: '🔍 Identificado',
        next_action_text: 'Enviar email',
        estimated_value: 1200.5,
        suggested_on: '2026-10-06',
        number: 99,
        foo: 'bar',
      },
      SECTORS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lead).toMatchObject({
      company_name: 'Restaurante O Lagar',
      sector_id: SECTORS[0]!.id,
      website: 'https://olagar.pt',
      pagespeed: 34,
      mobile: 'nao',
      email: 'geral@olagar.pt',
      status: 'identificado',
      next_action_text: 'Enviar email',
      estimated_value: 1200.5,
      suggested_on: '2026-10-06',
    });
    expect(r.value.number).toBeNull();
    expect(r.value.warnings).toContain('Campos ignorados: foo.');
  });

  it('aceita nomes alternativos e booleanos', () => {
    const r = mapIntegrationLead({ name: 'Clínica Sá', url: 'https://clinicasa.pt', mobile: true }, SECTORS);
    expect(r.ok && r.value.lead).toMatchObject({ company_name: 'Clínica Sá', website: 'https://clinicasa.pt', mobile: 'sim' });
  });

  it('sem nome da empresa é inválido', () => {
    const r = mapIntegrationLead({ website: 'x.pt' }, SECTORS);
    expect(r.ok).toBe(false);
  });
});

describe('IntegrationImportSchema', () => {
  it('aplica os valores por omissão e limita o tamanho', () => {
    const parsed = IntegrationImportSchema.parse({ leads: [{ company_name: 'A' }] });
    expect(parsed).toMatchObject({ on_duplicate: 'skip', dry_run: false });
    expect(IntegrationImportSchema.safeParse({ leads: [] }).success).toBe(false);
    expect(IntegrationImportSchema.safeParse({ leads: Array(501).fill({ company_name: 'A' }) }).success).toBe(false);
  });
});
