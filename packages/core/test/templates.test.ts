import { describe, expect, it } from 'vitest';
import { buildTemplateContext, formatSignature, mailtoUrl, renderTemplate, templateVariablesIn } from '../src/templates';

const signature = {
  full_name: 'Vá Nancassa',
  role_title: 'Designer Gráfico & Web Designer',
  company: 'VNDesign',
  phone: '+351 900 000 000',
  website: 'https://vndesign.pt',
  portfolio_url: 'https://vndesign.pt/',
  project_links: ['https://estrelamadora.pt/', 'https://capeliving.pt/'],
};
const lead = {
  company_name: 'Cervejaria Exemplo',
  contact_name: null,
  city: 'Amadora',
  problems: 'só tem página de Facebook.',
  approach_angle: 'Proponho um site simples com a carta e reservas.',
  website: 'https://facebook.com/exemplo',
  first_contact_on: '2026-10-08',
  sector: { name: 'Restauração' },
};

describe('renderTemplate', () => {
  const ctx = buildTemplateContext({
    lead,
    signature,
    optOutLine: 'Se não quiser receber mais contactos, basta responder a este email.',
    today: '2026-10-11',
  });

  it('substitui as variáveis e arruma as vazias', () => {
    const r = renderTemplate('Olá {{contacto}},\n\nVi o site da {{empresa}} ({{cidade}}) e reparei que {{problema}}', ctx);
    expect(r.text).toBe('Olá,\n\nVi o site da Cervejaria Exemplo (Amadora) e reparei que só tem página de Facebook.');
    expect(r.missing).toEqual(['contacto']);
  });

  it('usa a alternativa quando a variável está vazia', () => {
    expect(renderTemplate('Olá {{contacto|equipa da {{empresa}}}}', ctx).text).toContain('Olá equipa da');
    expect(renderTemplate('Olá {{ contacto | equipa }},', ctx).text).toBe('Olá equipa,');
  });

  it('assinatura, portfólio, projetos, datas e opt-out', () => {
    const r = renderTemplate('{{data}}\n{{portfolio}}\n{{projetos}}\n\n{{assinatura}}\n\n{{opt_out}}', ctx);
    expect(r.text).toBe(
      '08/10/2026\nhttps://vndesign.pt/\nhttps://estrelamadora.pt/ · https://capeliving.pt/\n\n' +
        'Vá Nancassa\nDesigner Gráfico & Web Designer · VNDesign\n+351 900 000 000 · vndesign.pt\n\n' +
        'Se não quiser receber mais contactos, basta responder a este email.',
    );
  });

  it('reporta variáveis desconhecidas sem as apagar', () => {
    const r = renderTemplate('Olá {{nome_errado}}', ctx);
    expect(r.text).toBe('Olá {{nome_errado}}');
    expect(r.unknown).toEqual(['nome_errado']);
  });

  it('não deixa linhas vazias a mais quando falta um bloco inteiro', () => {
    const r = renderTemplate('A\n\n{{argumentos}}\n\nB', ctx);
    expect(r.text).toBe('A\n\nB');
  });
});

describe('utilitários', () => {
  it('formatSignature', () => {
    expect(formatSignature({ full_name: 'Só Nome' })).toBe('Só Nome');
  });
  it('templateVariablesIn', () => {
    expect(templateVariablesIn('{{empresa}} {{ Contacto }} {{empresa}}')).toEqual(['empresa', 'contacto']);
  });
  it('mailtoUrl usa %20', () => {
    expect(mailtoUrl('a@b.pt', 'Olá mundo', 'Linha 1\nLinha 2')).toBe(
      'mailto:a@b.pt?subject=Ol%C3%A1%20mundo&body=Linha%201%0ALinha%202',
    );
  });
});
