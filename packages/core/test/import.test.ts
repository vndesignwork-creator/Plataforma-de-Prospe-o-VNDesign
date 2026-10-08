import { describe, expect, it } from 'vitest';
import {
  detectHeaderRow,
  findBatchDuplicates,
  isEmptyRow,
  mapImportRow,
  parseNextAction,
  suggestField,
  suggestMapping,
} from '../src/import';
import { leadsToCsv } from '../src/export';
import type { Lead } from '../src/schemas';

// Cabeçalho igual ao da folha "🎯 Pipeline de Leads" (linha 2; a linha 1 é o título).
const SHEET_HEADER = [
  '#', 'Empresa', 'Setor', 'Website', 'Cidade', 'Problemas', 'PageSpeed', 'Mobile?', 'Email', 'Telefone',
  'Contacto', 'Estado', 'Canal', '1º Contacto', 'Último Follow-up', 'Próx. Ação', 'Valor Est. (€)', 'Notas',
  'Ângulo de abordagem', 'Fonte', 'Sugerido em', 'Assunto do email', 'Email de prospeção',
];
const SHEET = [
  ['🎯  PIPELINE DE LEADS — PROSPEÇÃO DIGITAL VNDesign'],
  SHEET_HEADER,
  ['1', 'EMPRESA EXEMPLO, S.A.', '💼 Outro', '--', 'Amadora', 'Sem site', '--', '--', 'geral@exemplo.pt', '--', '--',
    '📧 Contactado', '📧 Email', '--', '--', '--', '--'],
  ['2', 'OFICINA TESTE,\nUNIPESSOAL, LDA', '🔧 Serviços Técnicos', 'http://www.oficina-teste.pt/', 'Amadora',
    'Site não abre (erro SSL)', '34', '❌ Não', ' geral@oficina-teste.pt', '214 000 000', 'Rui', '🔍 Identificado', '--',
    '01/10/2026', '--', 'Ligar 12/10/2026', '1.250,00 €', 'Nota', 'Ângulo', 'https://exemplo.pt/fonte', '08/10/2026',
    'Assunto', 'Boa tarde,\n\nCorpo'],
  ['3', 'Restaurante Exemplo', '🍽️ Restauração', 'https://www.facebook.com/restauranteexemplo/', 'Amadora (Damaia)',
    '', '', '', '', '', '', '🔍 Identificado', '', '', '', '', '', '', '', '', '08/10/2026'],
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
];
const SECTORS = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Outro', slug: 'outro' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Serviços Técnicos', slug: 'servicos-tecnicos' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Restauração', slug: 'restauracao' },
];

describe('cabeçalhos e mapeamento', () => {
  it('deteta a linha de cabeçalho a seguir ao título', () => {
    expect(detectHeaderRow(SHEET)).toBe(1);
  });

  it('mapeia todas as colunas da folha atual', () => {
    const mapping = suggestMapping(SHEET_HEADER);
    expect(mapping).toEqual([
      'number', 'company_name', 'sector', 'website', 'city', 'problems', 'pagespeed', 'mobile', 'email', 'phone',
      'contact_name', 'status', 'channel', 'first_contact_on', 'last_follow_up_on', 'next_action', 'estimated_value',
      'notes', 'approach_angle', 'source_url', 'suggested_on', 'email_subject', 'email_body',
    ]);
  });

  it('reconhece variações e as colunas da exportação', () => {
    expect(suggestField('📧 E-mail')).toBe('email');
    expect(suggestField('1.º contacto')).toBe('first_contact_on');
    expect(suggestField('Data da próxima ação')).toBe('next_action_on');
    expect(suggestField('Valor estimado (€)')).toBe('estimated_value');
    expect(suggestField('Coluna desconhecida')).toBeNull();
  });

  it('cada campo só é usado uma vez', () => {
    expect(suggestMapping(['Empresa', 'Nome'])).toEqual(['company_name', 'ignore']);
  });
});

describe('mapImportRow', () => {
  const mapping = suggestMapping(SHEET_HEADER);

  it('converte valores com emoji, "--", datas e euros', () => {
    const r = mapImportRow(SHEET[3]!, mapping, SECTORS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.number).toBe(2);
    expect(r.value.lead).toMatchObject({
      company_name: 'OFICINA TESTE, UNIPESSOAL, LDA',
      sector_id: SECTORS[1]!.id,
      website: 'http://www.oficina-teste.pt/',
      pagespeed: 34,
      mobile: 'nao',
      email: 'geral@oficina-teste.pt',
      phone: '214 000 000',
      contact_name: 'Rui',
      status: 'identificado',
      first_contact_on: '2026-10-01',
      next_action_text: 'Ligar',
      next_action_on: '2026-10-12',
      estimated_value: 1250,
      suggested_on: '2026-10-08',
      email_body: 'Boa tarde,\n\nCorpo',
    });
    expect(r.value.warnings).toEqual([]);
  });

  it('"--" fica vazio e o estado/canal com emoji são reconhecidos', () => {
    const r = mapImportRow(SHEET[2]!, mapping, SECTORS);
    expect(r.ok && r.value.lead).toMatchObject({ status: 'contactado', channel: 'email', sector_id: SECTORS[0]!.id });
    expect(r.ok && r.value.lead.website).toBeUndefined();
  });

  it('avisa sobre valores inválidos sem rejeitar a linha', () => {
    const row = ['9', 'X', '🏛️ Inexistente', 'não é um url', '', '', 'abc', '', 'sem-email', '', '', 'Talvez'];
    const r = mapImportRow(row, mapping, SECTORS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings.length).toBe(5);
    expect(r.value.lead.sector_id).toBeUndefined();
    expect(r.value.lead.website).toBeUndefined();
  });

  it('linha sem empresa é inválida; linhas vazias são detetadas', () => {
    expect(mapImportRow(['5', '--'], mapping, SECTORS).ok).toBe(false);
    expect(isEmptyRow(SHEET[5]!)).toBe(true);
    expect(isEmptyRow(['--', ' '])).toBe(true);
  });
});

describe('parseNextAction', () => {
  it.each([
    ['Ligar 12/10/2026', { text: 'Ligar', date: '2026-10-12' }],
    ['12/10/2026', { text: null, date: '2026-10-12' }],
    ['Enviar proposta (15/10/2026)', { text: 'Enviar proposta', date: '2026-10-15' }],
    ['Follow-up até 20/10/26', { text: 'Follow-up', date: '2026-10-20' }],
    ['Passar lá', { text: 'Passar lá', date: null }],
    ['--', { text: null, date: null }],
  ])('%j', (input, expected) => {
    expect(parseNextAction(input)).toEqual(expected);
  });
});

describe('findBatchDuplicates', () => {
  it('encontra duplicados dentro do ficheiro', () => {
    expect(
      findBatchDuplicates([
        { company_name: 'Oficina Teste, Lda', website: 'oficina-teste.pt' },
        { company_name: 'Outra', email: 'geral@oficina-teste.pt' },
        { company_name: 'OFICINA TESTE' },
        { company_name: 'Sem relação', email: 'a@gmail.com' },
        { company_name: 'Também sem relação', email: 'b@gmail.com' },
        null,
      ]),
    ).toEqual([null, 0, 0, null, null, null]);
  });
});

describe('leadsToCsv', () => {
  it('gera CSV para o Excel pt-PT (BOM, ";", vírgula decimal, DD/MM/AAAA)', () => {
    const lead = {
      number: 7, company_name: 'Café "Central"; Lda', sector: { id: 'x', name: 'Restauração', slug: 'restauracao', emoji: '🍽️' },
      website: null, city: 'Amadora', address: null, problems: '=HYPERLINK("x")', pagespeed: 40, mobile: 'parcial',
      email: null, phone: null, contact_name: null, status: 'contactado', channel: 'email', first_contact_on: '2026-10-08',
      last_follow_up_on: null, next_action_text: null, next_action_on: null, estimated_value: 1250.5, notes: 'a\nb',
      approach_angle: null, source_url: null, suggested_on: null, email_subject: null, email_body: null,
    } as unknown as Lead;
    const csv = leadsToCsv([lead]);
    expect(csv.startsWith('﻿#;Empresa;Setor;')).toBe(true);
    const line = csv.split('\r\n')[1]!;
    expect(line).toContain('7;"Café ""Central""; Lda";🍽️ Restauração;');
    expect(line).toContain(`;"'=HYPERLINK(""x"")";40;⚡ Parcial;`);
    expect(line).toContain(';📧 Contactado;📧 Email;08/10/2026;');
    expect(line).toContain(';1250,5;"a\nb";');
  });
});
