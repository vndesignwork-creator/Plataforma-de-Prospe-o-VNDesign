import { describe, expect, it } from 'vitest';
import {
  MonthlyGoalsSchema,
  TaskListUpdateSchema,
  WorkspaceSettingsSchema,
  domainLookupDue,
  goalPace,
  monthBounds,
  monthElapsed,
  nextRepeatDate,
  perWorkdayLeft,
  rdapBaseFor,
  rdapExpiry,
  registrableDomain,
  siteIssues,
} from '../src';

describe('nextRepeatDate', () => {
  it('a seguir ao prazo', () => {
    expect(nextRepeatDate('2026-11-05', 'daily', '2026-11-05')).toBe('2026-11-06');
    expect(nextRepeatDate('2026-11-05', 'weekly', '2026-11-05')).toBe('2026-11-12');
    expect(nextRepeatDate('2026-11-01', 'monthly', '2026-11-01')).toBe('2026-12-01');
    expect(nextRepeatDate('2026-11-05', 'yearly', '2026-11-05')).toBe('2027-11-05');
  });
  it('dias úteis salta o fim de semana', () => {
    // 06/11/2026 é sexta-feira
    expect(nextRepeatDate('2026-11-06', 'weekdays', '2026-11-06')).toBe('2026-11-09');
  });
  it('mensal no dia 31 fica no último dia do mês e volta ao 31', () => {
    expect(nextRepeatDate('2027-01-31', 'monthly', '2027-01-31')).toBe('2027-02-28');
    expect(nextRepeatDate('2027-01-31', 'monthly', '2027-02-28')).toBe('2027-03-31');
  });
  it('concluída atrasada: salta as vezes que já passaram', () => {
    expect(nextRepeatDate('2026-11-01', 'monthly', '2026-11-03')).toBe('2026-12-01');
    expect(nextRepeatDate('2026-10-01', 'weekly', '2026-11-05')).toBe('2026-11-12');
  });
  it('sem prazo: a partir de hoje', () => {
    expect(nextRepeatDate(null, 'daily', '2026-11-05')).toBe('2026-11-06');
  });
  it('concluída antes do prazo: a seguinte é a seguir ao prazo', () => {
    expect(nextRepeatDate('2026-11-20', 'weekly', '2026-11-05')).toBe('2026-11-27');
  });
});

describe('metas do mês', () => {
  it('limites do mês', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
  it('parte do mês passada em dias úteis', () => {
    expect(monthElapsed('2026-11', '2026-10-31')).toBe(0);
    expect(monthElapsed('2026-11', '2026-12-01')).toBe(1);
    const mid = monthElapsed('2026-11', '2026-11-16');
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
  it('ritmo', () => {
    expect(goalPace(20, 20, 0.5)).toBe('reached');
    expect(goalPace(10, 20, 0.5)).toBe('on_track');
    expect(goalPace(4, 20, 0.5)).toBe('behind');
    expect(goalPace(15, 20, 0.5)).toBe('ahead');
  });
  it('quanto falta por dia útil', () => {
    // Segunda 30/11 é o último dia útil de novembro de 2026.
    expect(perWorkdayLeft(10, 20, '2026-11', '2026-11-30')).toBe(10);
    expect(perWorkdayLeft(20, 20, '2026-11', '2026-11-30')).toBeNull();
  });
  it('as definições aceitam metas vazias e números inteiros', () => {
    expect(WorkspaceSettingsSchema.parse({}).goals).toEqual({});
    expect(MonthlyGoalsSchema.safeParse({ calls: 200, revenue: 3000, whatsapp: null }).success).toBe(true);
    expect(MonthlyGoalsSchema.safeParse({ calls: 0 }).success).toBe(false);
    expect(MonthlyGoalsSchema.safeParse({ calls: 2.5 }).success).toBe(false);
  });
});

describe('sites dos clientes', () => {
  const base = { is_up: true, down_since: null, ssl_expires_at: null, ssl_error: null, domain_expires_on: null, url: 'https://cliente.pt', error: null };
  it('sem problemas', () => {
    expect(siteIssues({ ...base, ssl_expires_at: '2027-05-01T00:00:00Z', domain_expires_on: '2027-05-01' }, '2026-11-05')).toEqual([]);
  });
  it('em baixo, SSL e domínio a expirar', () => {
    const issues = siteIssues({ ...base, down_since: '2026-11-05T08:00:00Z', error: 'O site não respondeu a tempo.', ssl_expires_at: '2026-11-10T00:00:00Z', domain_expires_on: '2026-11-30' }, '2026-11-05');
    expect(issues.map((i) => i.kind)).toEqual(['down', 'ssl_soon', 'domain_soon']);
    expect(issues[1]!.label).toBe('Certificado SSL expira em 5 dias');
  });
  it('expirados', () => {
    const issues = siteIssues({ ...base, ssl_expires_at: '2026-11-01T00:00:00Z', ssl_error: 'O certificado expirou.', domain_expires_on: '2026-11-04' }, '2026-11-05');
    expect(issues.map((i) => i.kind)).toEqual(['ssl_expired', 'domain_expired']);
  });
  it('certificado que não corresponde ao domínio', () => {
    const issues = siteIssues({ ...base, ssl_expires_at: '2027-01-01T00:00:00Z', ssl_error: 'O certificado não corresponde a este domínio.' }, '2026-11-05');
    expect(issues.map((i) => i.kind)).toEqual(['ssl_error']);
  });
  it('domínio registável', () => {
    expect(registrableDomain('https://www.loja.cliente.pt/contactos')).toBe('cliente.pt');
    expect(registrableDomain('cliente.com.pt')).toBe('cliente.com.pt');
    expect(registrableDomain('www.exemplo.co.uk')).toBe('exemplo.co.uk');
    expect(registrableDomain('http://10.0.0.1')).toBeNull();
  });
  it('RDAP: base e data de expiração', () => {
    const bootstrap = { services: [[['com', 'net'], ['https://rdap.verisign.com/com/v1/']], [['pt'], ['https://rdap.dns.pt']]] };
    expect(rdapBaseFor('cliente.pt', bootstrap)).toBe('https://rdap.dns.pt/');
    expect(rdapBaseFor('x.com', bootstrap)).toBe('https://rdap.verisign.com/com/v1/');
    expect(rdapBaseFor('x.fr', bootstrap)).toBeNull();
    expect(rdapExpiry({ events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }, { eventAction: 'expiration', eventDate: '2027-03-12T10:00:00Z' }] })).toBe('2027-03-12');
    expect(rdapExpiry({})).toBeNull();
  });
  it('quando voltar a consultar o domínio', () => {
    expect(domainLookupDue({ domain_checked_at: null, domain_expires_on: null, domain_source: null }, '2026-11-05')).toBe(true);
    expect(domainLookupDue({ domain_checked_at: '2026-11-01T10:00:00Z', domain_expires_on: '2027-11-01', domain_source: 'rdap' }, '2026-11-05')).toBe(false);
    expect(domainLookupDue({ domain_checked_at: '2026-10-28T10:00:00Z', domain_expires_on: '2027-11-01', domain_source: 'rdap' }, '2026-11-05')).toBe(true);
    expect(domainLookupDue({ domain_checked_at: '2026-11-04T10:00:00Z', domain_expires_on: '2026-11-20', domain_source: 'rdap' }, '2026-11-05')).toBe(true);
    expect(domainLookupDue({ domain_checked_at: null, domain_expires_on: '2026-11-20', domain_source: 'manual' }, '2026-11-05')).toBe(false);
  });
});

describe('cartões', () => {
  it('arquivar e partilhar', () => {
    expect(TaskListUpdateSchema.parse({ archived: true, shared: true })).toEqual({ archived: true, shared: true });
  });
});

describe('frases com repetição', () => {
  // 05/11/2026 é quinta-feira
  const today = '2026-11-05';
  it('reconhece a repetição e tira-a do título', async () => {
    const { parseTaskPhrase } = await import('../src');
    expect(parseTaskPhrase('Enviar relatório ao cliente todos os meses', today)).toMatchObject({ title: 'Enviar relatório ao cliente', repeat: 'monthly', due_on: today });
    expect(parseTaskPhrase('Rever leads frios todas as segundas', today)).toMatchObject({ title: 'Rever leads frios', repeat: 'weekly', due_on: '2026-11-09' });
    expect(parseTaskPhrase('Faturar avenças todo o dia 1', today)).toMatchObject({ title: 'Faturar avenças', repeat: 'monthly', due_on: '2026-12-01' });
    expect(parseTaskPhrase('Ver emails todos os dias às 9h', today)).toMatchObject({ title: 'Ver emails', repeat: 'daily', time: '09:00' });
    expect(parseTaskPhrase('Backup nos dias úteis', today)).toMatchObject({ repeat: 'weekdays' });
    expect(parseTaskPhrase('Ligar à Clínica sexta', today).repeat).toBeNull();
  });
});
