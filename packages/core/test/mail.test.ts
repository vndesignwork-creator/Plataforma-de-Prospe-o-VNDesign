import { describe, expect, it } from 'vitest';
import { LeadEmailSendSchema, MailAccountUpsertSchema, plainTextToHtml } from '../src/mail';

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
