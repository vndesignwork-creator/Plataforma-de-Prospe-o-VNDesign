import { describe, expect, it } from 'vitest';
import { CONTRACT_TEMPLATES_MAX, contractClausesFor, contractTemplateId, type ContractTemplate } from '../src/contracts';
import { WorkspaceSettingsSchema } from '../src/schemas';

const template = (over: Partial<ContractTemplate> = {}): ContractTemplate => ({
  id: 'loja',
  label: 'Loja online',
  services: ['loja_online'],
  clauses: 'Stock e encomendas: o cliente trata do stock.',
  ...over,
});

describe('condições do contrato por tipo de serviço', () => {
  const contract = { clauses: 'Condições gerais.', templates: [template(), template({ id: 'manutencao', label: 'Manutenção', services: ['manutencao'], clauses: 'Avença mensal.' })] };

  it('usa o modelo do serviço do projeto', () => {
    const chosen = contractClausesFor(contract, ['loja_online']);
    expect(chosen.clauses).toBe('Stock e encomendas: o cliente trata do stock.');
    expect(chosen.template?.label).toBe('Loja online');
  });

  it('sem modelo que sirva, ficam as condições gerais', () => {
    expect(contractClausesFor(contract, ['site_institucional'])).toEqual({ clauses: 'Condições gerais.', template: null });
    expect(contractClausesFor(contract, []).template).toBeNull();
    expect(contractClausesFor(contract, null).clauses).toBe('Condições gerais.');
  });

  it('vale o primeiro modelo que serve (a ordem da lista decide)', () => {
    const chosen = contractClausesFor(contract, ['manutencao', 'loja_online']);
    expect(chosen.template?.label).toBe('Loja online');
  });

  it('sem modelos nenhuns (definições antigas) continua a funcionar', () => {
    expect(contractClausesFor({ clauses: 'Só as gerais.' }, ['loja_online']).clauses).toBe('Só as gerais.');
  });
});

describe('id do modelo', () => {
  it('faz um id simples a partir do nome', () => {
    expect(contractTemplateId('Loja online')).toBe('loja-online');
    expect(contractTemplateId('Manutenção & Avença')).toBe('manutencao-avenca');
  });

  it('nome vazio na mesma dá um id', () => {
    expect(contractTemplateId('   ')).toMatch(/^modelo-/);
  });
});

describe('definições', () => {
  it('as definições antigas ficam sem modelos (e não rebentam)', () => {
    const settings = WorkspaceSettingsSchema.parse({});
    expect(settings.contract.templates).toEqual([]);
    expect(CONTRACT_TEMPLATES_MAX).toBe(10);
  });

  it('guarda os modelos escritos', () => {
    const settings = WorkspaceSettingsSchema.parse({ contract: { provider_nif: '123', clauses: 'Gerais', templates: [template()] } });
    expect(settings.contract.templates[0]?.services).toEqual(['loja_online']);
  });
});
