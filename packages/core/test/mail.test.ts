import { describe, expect, it } from 'vitest';
import { LeadEmailSendSchema, MailAccountUpsertSchema, isAutoReply, matchReplyToLead, plainTextToHtml } from '../src/mail';
import { isGenericEmailDomain } from '../src/normalize';

describe('plainTextToHtml', () => {
  it('parágrafos, quebras de linha e ligações clicáveis', () => {
    expect(plainTextToHtml('Boa tarde,\n\nVi o site https://exemplo.pt.\nObrigado')).toBe(
      '<p style="margin:0 0 1em">Boa tarde,</p>\n<p style="margin:0 0 1em">Vi o site <a href="https://exemplo.pt">https://exemplo.pt</a>.<br>Obrigado</p>',
    );
  });

  it('escapa HTML', () => {
    expect(plainTextToHtml('<script>"x" & y</script>')).toBe('<p style="margin:0 0 1em">&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;</p>');
  });
});

describe('MailAccountUpsertSchema', () => {
  it('tira os espaços da palavra-passe de aplicação do Gmail', () => {
    const v = MailAccountUpsertSchema.parse({ provider: 'gmail', from_name: 'Va', from_email: 'VNDesign.Work@Gmail.com', password: 'abcd efgh ijkl mnop' });
    expect(v.password).toBe('abcdefghijklmnop');
    expect(v.from_email).toBe('vndesign.work@gmail.com');
    expect(v.daily_limit).toBe(50);
  });

  it('palavra-passe vazia = manter a atual', () => {
    expect(MailAccountUpsertSchema.parse({ provider: 'gmail', from_name: 'Va', from_email: 'a@b.pt', password: '' }).password).toBeUndefined();
  });

  it('SMTP próprio precisa do servidor', () => {
    const r = MailAccountUpsertSchema.safeParse({ provider: 'custom', from_name: 'Va', from_email: 'a@b.pt' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['smtp_host']);
  });
});

describe('LeadEmailSendSchema', () => {
  it('recusa email inválido e assunto vazio', () => {
    const r = LeadEmailSendSchema.safeParse({ to: 'nao-e-email', subject: '  ', body: 'Olá' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(['to', 'subject']);
  });
});

describe('respostas dos leads', () => {
  const leads = [
    { id: 'a', email: 'geral@pastelaria.pt' },
    { id: 'b', email: 'clinica@gmail.com' },
    { id: 'c', email: 'info@oficina.pt' },
    { id: 'd', email: 'vendas@oficina.pt' },
  ];
  const sent = new Map([['<abc@vndesign.pt>', 'b']]);
  const generic = isGenericEmailDomain;

  it('In-Reply-To de um email enviado pela plataforma', () => {
    expect(matchReplyToLead({ from: 'outra@pessoa.pt', inReplyTo: '<abc@vndesign.pt>' }, leads, sent, generic)).toBe('b');
  });
  it('o mesmo endereço (sem diferença de maiúsculas)', () => {
    expect(matchReplyToLead({ from: 'Geral@Pastelaria.pt', inReplyTo: null }, leads, sent, generic)).toBe('a');
  });
  it('o mesmo domínio de empresa, só se houver um único lead', () => {
    expect(matchReplyToLead({ from: 'joao@pastelaria.pt', inReplyTo: null }, leads, sent, generic)).toBe('a');
    expect(matchReplyToLead({ from: 'joao@oficina.pt', inReplyTo: null }, leads, sent, generic)).toBeNull();
    expect(matchReplyToLead({ from: 'outro@gmail.com', inReplyTo: null }, leads, sent, generic)).toBeNull();
  });
  it('ignora avisos do servidor', () => {
    expect(matchReplyToLead({ from: 'mailer-daemon@pastelaria.pt', inReplyTo: '<abc@vndesign.pt>' }, leads, sent, generic)).toBeNull();
  });
  it('respostas automáticas', () => {
    expect(isAutoReply('Resposta automática: Uma ideia')).toBe(true);
    expect(isAutoReply('RE: Out of Office')).toBe(true);
    expect(isAutoReply('Re: Uma ideia', 'auto-replied')).toBe(true);
    expect(isAutoReply('Re: Uma ideia', 'no')).toBe(false);
    expect(isAutoReply('Re: Uma ideia')).toBe(false);
  });
});
