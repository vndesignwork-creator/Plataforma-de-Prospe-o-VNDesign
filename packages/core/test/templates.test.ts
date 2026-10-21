import { describe, expect, it } from 'vitest';
import { buildTemplateContext, formatSignature, mailtoUrl, meetingPhrase, renderTemplate, templateVariablesIn } from '../src/templates';

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

describe('variáveis dos serviços do lead', () => {
  const sig = { ...signature, design_portfolio_url: 'https://vndesign.pt/design/' };

  it('{{servicos}}, {{categoria}} e {{beneficio}} a partir dos serviços (pela ordem do catálogo)', () => {
    const ctx = buildTemplateContext({ lead: { ...lead, services: ['flyers_cartazes', 'identidade_visual'] }, signature: sig, today: '2026-10-11' });
    expect(ctx.servicos).toBe('identidade visual e flyers e cartazes');
    expect(ctx.categoria).toBe('design gráfico');
    expect(ctx.beneficio).toBe('uma imagem coerente que os clientes reconhecem à primeira vista');
    // Design Gráfico usa o portefólio de design.
    expect(ctx.portfolio).toBe('https://vndesign.pt/design/');
  });

  it('três ou mais serviços: vírgulas e "e"; siglas ficam em maiúsculas', () => {
    const services = [
      { key: 'seo', label: 'Otimização SEO', category: 'web', value_phrase: null },
      { key: 'blog', label: 'Blogs Personalizados', category: 'web', value_phrase: 'um blog que traz visitas' },
      { key: 'loja_online', label: 'Pequenas Lojas', category: 'web' },
    ];
    const ctx = buildTemplateContext({ lead: { ...lead, services: ['loja_online', 'seo', 'blog'] }, signature: sig, today: '2026-10-11', services });
    expect(ctx.servicos).toBe('otimização SEO, blogs personalizados e pequenas lojas');
    expect(ctx.categoria).toBe('web design');
    // O 1.º sem frase é ignorado: usa a do seguinte.
    expect(ctx.beneficio).toBe('um blog que traz visitas');
    expect(ctx.portfolio).toBe('https://vndesign.pt/');
  });

  it('sem serviços: vazias (as alternativas do modelo tomam conta)', () => {
    const ctx = buildTemplateContext({ lead, signature: sig, today: '2026-10-11' });
    expect(ctx.servicos).toBeNull();
    expect(renderTemplate('Trabalho em {{servicos|design}} para ter {{beneficio|uma imagem forte}}.', ctx).text).toBe(
      'Trabalho em design para ter uma imagem forte.',
    );
  });
});

describe('variáveis da reunião ({{reuniao}})', () => {
  const now = new Date('2026-10-27T09:00:00Z'); // terça-feira, 09:00 em Lisboa (hora de inverno desde 25/10)

  it('diz hoje, amanhã ou o dia da semana, na hora de Lisboa', () => {
    expect(meetingPhrase('2026-10-27T15:30:00Z', now)).toBe('hoje, às 15:30');
    expect(meetingPhrase('2026-10-28T10:00:00Z', now)).toBe('amanhã, às 10:00');
    expect(meetingPhrase('2026-10-30T14:00:00Z', now)).toBe('sexta-feira, 30/10, às 14:00');
    expect(meetingPhrase('2026-07-01T09:00:00Z', now)).toBe('quarta-feira, 01/07, às 10:00');
  });

  it('preenche o lembrete; sem reunião, as linhas ficam vazias', () => {
    const body = 'Só para lembrar a nossa reunião de {{reuniao}}.\n{{reuniao_local}}\n\nAté já!';
    const withMeeting = buildTemplateContext({ today: '2026-10-27', now, meeting: { starts_at: '2026-10-28T10:00:00Z', location: 'Google Meet' } });
    expect(renderTemplate(body, withMeeting).text).toBe('Só para lembrar a nossa reunião de amanhã, às 10:00.\nGoogle Meet\n\nAté já!');
    const without = renderTemplate(body, buildTemplateContext({ today: '2026-10-27' }));
    expect(without.missing).toEqual(['reuniao', 'reuniao_local']);
  });
});
