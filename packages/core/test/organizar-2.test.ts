import { describe, expect, it } from 'vitest';
import {
  CardScanInputSchema,
  CustomFieldCreateSchema,
  CustomValuesSchema,
  LeadListQuerySchema,
  LeadUpdateSchema,
  buildLeadSummaryPrompt,
  cardScanResult,
  cleanOptions,
  compareDelta,
  comparePeriods,
  customFilterValue,
  exportColumns,
  formatCustomValue,
  leadSummaryResult,
  newCustomFieldKey,
  sanitizeCustomValues,
  trashFilePaths,
  upsertView,
  viewQuery,
  type CustomField,
  type Lead,
} from '../src';

const fields: CustomField[] = [
  { id: '00000000-0000-4000-8000-000000000001', key: 'fabc12345', label: 'Nº de lojas', type: 'number', options: [], sort_order: 1 },
  { id: '00000000-0000-4000-8000-000000000002', key: 'fdef67890', label: 'Tem Instagram?', type: 'yes_no', options: [], sort_order: 2 },
  { id: '00000000-0000-4000-8000-000000000003', key: 'fghi11111', label: 'Programa', type: 'choice', options: ['Primavera', 'Moloni'], sort_order: 3 },
  { id: '00000000-0000-4000-8000-000000000004', key: 'fjkl22222', label: 'Observação', type: 'text', options: [], sort_order: 4 },
];

describe('campos personalizados', () => {
  it('cada valor fica do seu tipo; desconhecidos e vazios saem', () => {
    expect(
      sanitizeCustomValues(
        { fabc12345: '1 200,5', fdef67890: 'Sim', fghi11111: 'moloni', fjkl22222: '  ok  ', fzzz99999: 'x', fxxxxxx: '' },
        fields,
      ),
    ).toEqual({ fabc12345: 1200.5, fdef67890: true, fghi11111: 'Moloni', fjkl22222: 'ok' });
    // Opção que não existe e número inválido não entram.
    expect(sanitizeCustomValues({ fghi11111: 'SAGE', fabc12345: 'muitas', fdef67890: false }, fields)).toEqual({ fdef67890: false });
  });

  it('opções sem vírgulas nem repetidas; escolha precisa de 2', () => {
    expect(cleanOptions(['A, B', 'a, b', ' C ', ''])).toEqual(['A B', 'C']);
    expect(CustomFieldCreateSchema.safeParse({ label: 'Programa', type: 'choice', options: ['Só uma'] }).success).toBe(false);
    expect(CustomFieldCreateSchema.parse({ label: ' Lojas ', type: 'number' })).toEqual({ label: 'Lojas', type: 'number', options: [] });
  });

  it('chaves curtas e estáveis; valores e filtros para mostrar', () => {
    expect(newCustomFieldKey(() => 0)).toBe('faaaaaaaa');
    expect(newCustomFieldKey()).toMatch(/^f[a-z0-9]{8}$/);
    expect(formatCustomValue({ type: 'yes_no' }, true)).toBe('Sim');
    expect(formatCustomValue({ type: 'number' }, 1200)).toBe((1200).toLocaleString('pt-PT'));
    expect(formatCustomValue({ type: 'text' }, null)).toBe('');
    expect(customFilterValue({ key: 'fdef67890', type: 'yes_no' }, 'Sim')).toBe('fdef67890:true');
    expect(CustomValuesSchema.safeParse({ 'não-é-chave': 'x' }).success).toBe(false);
    expect(LeadUpdateSchema.parse({ custom: { fabc12345: 3 }, pinned_note: ' Só depois das 15h ' })).toEqual({ custom: { fabc12345: 3 }, pinned_note: 'Só depois das 15h' });
  });

  it('a lista filtra por campo ("chave:valor") e por "sem próximo passo"', () => {
    const q = LeadListQuerySchema.parse({ cf: 'fghi11111:Moloni,fdef67890:true', due: 'none' });
    expect(q.cf).toEqual(['fghi11111:Moloni', 'fdef67890:true']);
    expect(q.due).toBe('none');
    expect(LeadListQuerySchema.safeParse({ cf: 'x:y' }).success).toBe(false);
  });

  it('exportação: nota afixada e os campos no fim', () => {
    const cols = exportColumns(undefined, fields);
    const headers = cols.map((c) => c.header);
    expect(headers.slice(-5)).toEqual(['Nota afixada', 'Nº de lojas', 'Tem Instagram?', 'Programa', 'Observação']);
    const lead = { pinned_note: 'Ligar à tarde', custom: { fabc12345: 3, fdef67890: false } } as unknown as Lead;
    expect(cols.at(-5)!.value(lead)).toBe('Ligar à tarde');
    expect(cols.at(-4)!.value(lead)).toBe(3);
    expect(cols.at(-3)!.value(lead)).toBe('Não');
    expect(cols.at(-2)!.value(lead)).toBeNull();
  });
});

describe('estatísticas: comparar com o período anterior', () => {
  it('mês até hoje contra o mês anterior até ao mesmo dia (sem passar do fim do mês)', () => {
    expect(comparePeriods('month', '2026-10-24')).toEqual({ current: { from: '2026-10-01', to: '2026-10-24' }, previous: { from: '2026-09-01', to: '2026-09-24' } });
    expect(comparePeriods('month', '2026-03-31').previous).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(comparePeriods('month', '2027-01-15').previous).toEqual({ from: '2026-12-01', to: '2026-12-15' });
  });
  it('semana de segunda até hoje contra a semana anterior', () => {
    // 2026-10-24 é sábado.
    expect(comparePeriods('week', '2026-10-24')).toEqual({ current: { from: '2026-10-19', to: '2026-10-24' }, previous: { from: '2026-10-12', to: '2026-10-17' } });
  });
  it('diferença e percentagem', () => {
    expect(compareDelta(12, 8)).toEqual({ diff: 4, percent: 50, trend: 'up' });
    expect(compareDelta(3, 0)).toEqual({ diff: 3, percent: null, trend: 'up' });
    expect(compareDelta(2, 4).trend).toBe('down');
    expect(compareDelta(5, 5).trend).toBe('same');
  });
});

describe('filtros guardados', () => {
  it('a mesma ordem para os mesmos filtros; sem a página', () => {
    expect(viewQuery(new URLSearchParams('status=contactado&page=3&q=lisboa'))).toBe('q=lisboa&status=contactado');
    expect(viewQuery(new URLSearchParams('q=lisboa&status=contactado'))).toBe('q=lisboa&status=contactado');
    expect(viewQuery({ etiqueta: 'feira de março' })).toBe('etiqueta=feira%20de%20mar%C3%A7o');
  });
  it('guardar com o mesmo nome substitui; o mais recente primeiro', () => {
    const one = upsertView([], 'Lisboa', 'q=lisboa', 'a');
    const two = upsertView(one, 'Porto', 'q=porto', 'b');
    expect(two.map((v) => v.name)).toEqual(['Porto', 'Lisboa']);
    expect(upsertView(two, 'lisboa', 'q=lisboa&status=x', 'c').map((v) => [v.name, v.query])).toEqual([
      ['lisboa', 'q=lisboa&status=x'],
      ['Porto', 'q=porto'],
    ]);
  });
});

describe('reciclagem', () => {
  it('ficheiros do kit da marca e do briefing para apagar de vez', () => {
    expect(
      trashFilePaths({
        children: {
          lead_brand_kits: [{ files: [{ path: 'ws/lead/logo.png' }, { name: 'sem caminho' }] }],
          project_briefings: [{ files: [{ path: 'ws/lead/briefing.pdf' }] }],
          lead_tasks: [{ title: 'x' }],
        },
      }),
    ).toEqual([
      { bucket: 'brand-kits', path: 'ws/lead/logo.png' },
      { bucket: 'project-files', path: 'ws/lead/briefing.pdf' },
    ]);
    expect(trashFilePaths(null)).toEqual([]);
  });
});

describe('cartão de visita e resumo com IA', () => {
  it('limpa a leitura do cartão (email, site, textos)', () => {
    const r = cardScanResult(
      { empresa: ' Padaria  Estrela ', contacto: 'Ana', email: 'ANA@Padaria.PT', telefone: '912 345 678', site: 'padaria estrela.pt', cidade: null, morada: '', notas: null },
      'm',
    );
    expect(r).toMatchObject({ company_name: 'Padaria Estrela', email: 'ana@padaria.pt', website: 'padariaestrela.pt', address: null, model: 'm' });
    expect(cardScanResult({ empresa: null, contacto: null, email: 'não é email', telefone: null, site: 'x', cidade: null, morada: null, notas: null }, 'm')).toMatchObject({
      email: null,
      website: null,
    });
    expect(CardScanInputSchema.safeParse({ image: 'data:image/gif;base64,AAAA' }).success).toBe(false);
    expect(CardScanInputSchema.safeParse({ image: 'data:image/jpeg;base64,/9j/4AAQ' }).success).toBe(true);
  });

  it('o pedido do resumo leva a ficha; a resposta fica limpa', () => {
    const prompt = buildLeadSummaryPrompt({
      today: '2026-10-24',
      lead: {
        company_name: 'Tasca do Zé',
        status: 'Respondeu',
        contact_name: 'Zé',
        city: 'Lisboa',
        website: null,
        services: ['Site'],
        notes: 'Quer reservas online',
        pinned_note: 'Só depois das 15h',
        problems: null,
        next_action_text: null,
        next_action_on: null,
        estimated_value: null,
      },
      activities: [{ date: '2026-10-20', type: 'Chamada', text: 'Pediu proposta' }],
      tasks: [{ title: 'Enviar proposta', due_on: '2026-10-25', done: false }],
      proposals: [],
      meetings: [],
    });
    expect(prompt).toContain('Empresa: Tasca do Zé');
    expect(prompt).toContain('Nota afixada: Só depois das 15h');
    expect(prompt).toContain('2026-10-20 · Chamada · Pediu proposta');
    expect(prompt).toContain('[por fazer] Enviar proposta (até 2026-10-25)');
    expect(prompt).not.toContain('Valor estimado');
    expect(leadSummaryResult({ resumo: ' Ok. ', combinado: '  ', proximo_passo: 'Ligar', atencao: null }, 'm')).toEqual({
      summary: 'Ok.',
      agreed: null,
      next_step: 'Ligar',
      watch_out: null,
      model: 'm',
    });
  });
});
