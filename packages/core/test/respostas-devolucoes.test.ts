import { describe, expect, it } from 'vitest';
import { bounceRecipients, bouncedMessageId, isBounce, outOfOfficeReturn, replyBody, replyIntent } from '../src';

describe('emails devolvidos', () => {
  it('reconhece o aviso pelo remetente ou pelo assunto', () => {
    expect(isBounce('MAILER-DAEMON@mail.hostinger.com', 'Undelivered Mail Returned to Sender')).toBe(true);
    expect(isBounce('mailer-daemon@googlemail.com', 'Delivery Status Notification (Failure)')).toBe(true);
    expect(isBounce('postmaster@outlook.com', 'Não entregue: Ideia para o site')).toBe(true);
    expect(isBounce('ana@cliente.pt', 'Re: Ideia para o site')).toBe(false);
  });
  it('tira o endereço do relatório (ou do texto) e o Message-ID original', () => {
    const report = 'Reporting-MTA: dns; mx.hostinger.com\nFinal-Recipient: rfc822; Geral@Tasca.pt\nAction: failed\nStatus: 5.1.1';
    expect(bounceRecipients(report)).toEqual(['geral@tasca.pt']);
    expect(bounceRecipients('O email para info@padaria.pt não foi entregue. mailer-daemon@googlemail.com')).toEqual(['info@padaria.pt']);
    expect(bouncedMessageId('Subject: Ideia\nMessage-ID: <abc.123@vndesign.pt>\n')).toBe('<abc.123@vndesign.pt>');
  });
});

describe('respostas', () => {
  it('corta a mensagem citada', () => {
    expect(replyBody('Obrigado, não temos interesse.\n\nEm seg., 20/10/2026, Va escreveu:\n> Olá, tenho uma ideia')).toBe('Obrigado, não temos interesse.');
    expect(replyBody('Sim, pode ligar.\n> não estou interessado')).toBe('Sim, pode ligar.');
  });
  it('"não tenho interesse" e "removam-me"', () => {
    expect(replyIntent('Bom dia, não estamos interessados. Cumprimentos')).toBe('not_interested');
    expect(replyIntent('Já temos site, obrigado.')).toBe('not_interested');
    expect(replyIntent('Por favor removam o meu email da vossa lista.')).toBe('unsubscribe');
    expect(replyIntent('Não me contactem mais.')).toBe('unsubscribe');
    expect(replyIntent('Olá! Tenho interesse, pode ligar amanhã?')).toBeNull();
    // Só conta o texto novo, não o citado.
    expect(replyIntent('Pode ligar à tarde.\nEm 20/10, Va escreveu:\n> se não tiver interesse diga')).toBeNull();
  });
  it('ausência: o dia do regresso (até 60 dias)', () => {
    const today = '2026-10-25';
    expect(outOfOfficeReturn('Estou de férias. Regresso a 3/11.', today)).toBe('2026-11-03');
    expect(outOfOfficeReturn('Estarei ausente até dia 5 de novembro de 2026.', today)).toBe('2026-11-05');
    expect(outOfOfficeReturn("I'm out of the office until November 10.", today)).toBe('2026-11-10');
    expect(outOfOfficeReturn('Fora de 20/10 a 2/11, volto a 3/11', today)).toBe('2026-11-03');
    expect(outOfOfficeReturn('Ausente até 3/6/2027', today)).toBeNull(); // mais de 60 dias
    expect(outOfOfficeReturn('Obrigado pelo seu email.', today)).toBeNull();
  });
});

describe('prospeção: quem se pode contactar', () => {
  it('um email devolvido não conta; por telefone basta telefone ou email válido', async () => {
    const { prospectingReachable } = await import('../src');
    const bounced = { email: 'a@x.pt', phone: null, email_bounced_at: '2026-10-01T10:00:00Z' };
    expect(prospectingReachable(bounced, 'email')).toBe(false);
    expect(prospectingReachable(bounced, 'phone')).toBe(false);
    expect(prospectingReachable({ ...bounced, phone: '912345678' }, 'phone')).toBe(true);
    expect(prospectingReachable({ ...bounced, email_bounced_at: null }, 'email')).toBe(true);
    expect(prospectingReachable({ email: null, phone: '912345678', email_bounced_at: null }, 'email')).toBe(false);
  });
});
