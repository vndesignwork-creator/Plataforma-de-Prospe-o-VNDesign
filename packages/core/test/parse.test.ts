import { describe, expect, it } from 'vitest';
import {
  matchSector,
  parseChannel,
  parseEuroAmount,
  parseMobile,
  parsePageSpeed,
  parsePtDate,
  parseStatus,
  parseText,
  stripEmoji,
} from '../src/parse';

describe('valores da folha com emoji', () => {
  it.each([
    ['🔍 Identificado', 'identificado'],
    ['📧 Contactado', 'contactado'],
    ['💬 Respondeu', 'respondeu'],
    ['📞 Reunião', 'reuniao'],
    ['📄 Proposta Enviada', 'proposta_enviada'],
    ['🤝 Cliente', 'cliente'],
    ['❌ Sem interesse', 'sem_interesse'],
    ['⏸️ Em pausa', 'em_pausa'],
    ['proposta_enviada', 'proposta_enviada'],
    ['--', null],
    ['qualquer coisa', null],
  ])('estado %j → %j', (input, expected) => {
    expect(parseStatus(input)).toBe(expected);
  });

  it.each([
    ['📧 Email', 'email'],
    ['📞 Telefone', 'telefone'],
    ['📱 Instagram', 'instagram'],
    ['💼 LinkedIn', 'linkedin'],
    ['🗺️ Google Maps', 'google_maps'],
    ['👋 Pessoal', 'pessoal'],
    ['🌐 Outro', 'outro'],
    ['--', null],
  ])('canal %j → %j', (input, expected) => {
    expect(parseChannel(input)).toBe(expected);
  });

  it.each([
    ['✅ Sim', 'sim'],
    ['❌ Não', 'nao'],
    ['⚡ Parcial', 'parcial'],
    ['--', 'desconhecido'],
    ['', 'desconhecido'],
  ])('mobile %j → %j', (input, expected) => {
    expect(parseMobile(input)).toBe(expected);
  });

  it('encontra o setor pelo nome com emoji', () => {
    const sectors = [
      { id: '1', name: 'Saúde / Clínica', slug: 'saude-clinica' },
      { id: '2', name: 'Serviços Técnicos', slug: 'servicos-tecnicos' },
      { id: '3', name: 'Outro', slug: 'outro' },
    ];
    expect(matchSector('🏥 Saúde / Clínica', sectors)?.id).toBe('1');
    expect(matchSector('Saúde/Clínica', sectors)?.id).toBe('1');
    expect(matchSector('🔧 Serviços Técnicos', sectors)?.id).toBe('2');
    expect(matchSector('💼 Outro', sectors)?.id).toBe('3');
    expect(matchSector('Inexistente', sectors)).toBeNull();
  });

  it('stripEmoji', () => {
    expect(stripEmoji('🗺️ Google Maps')).toBe('Google Maps');
  });
});

describe('datas e números', () => {
  it.each([
    ['08/10/2026', '2026-10-08'],
    ['8/10/26', '2026-10-08'],
    ['08-10-2026', '2026-10-08'],
    ['2026-10-08', '2026-10-08'],
    ['31/02/2026', null],
    ['--', null],
  ])('data %j → %j', (input, expected) => {
    expect(parsePtDate(input)).toBe(expected);
  });

  it.each([
    ['1.250,50 €', 1250.5],
    ['1250', 1250],
    ['1.500', 1500],
    ['€ 900,00', 900],
    ['--', null],
    ['-5', null],
  ])('euros %j → %j', (input, expected) => {
    expect(parseEuroAmount(input)).toBe(expected);
  });

  it('pagespeed', () => {
    expect(parsePageSpeed('34')).toBe(34);
    expect(parsePageSpeed('34/100')).toBe(34);
    expect(parsePageSpeed('--')).toBeNull();
    expect(parsePageSpeed('150')).toBeNull();
  });

  it('texto', () => {
    expect(parseText('--')).toBeNull();
    expect(parseText(' Amadora ')).toBe('Amadora');
  });
});
