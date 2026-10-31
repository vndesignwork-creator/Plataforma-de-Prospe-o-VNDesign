import { describe, expect, it } from 'vitest';
import { describeNotification, notificationDay, stripLeadingEmoji } from '../src/notification-view';

const lead = { number: 13, company_name: 'O Quintal', phone: '912345678' };
const base = { task_id: null, lead, title: null as string | null, text: '' };

describe('describeNotification', () => {
  it('lembrete: sem emoji, sem o texto genérico, com as ações da tarefa', () => {
    const v = describeNotification({ ...base, kind: 'reminder', title: '⏰ Ligar ao Sr. Rui', text: 'Lembrete da tarefa', task_id: 'x' }, null);
    expect(v).toMatchObject({ label: 'Lembrete', tone: 'accent', title: 'Ligar ao Sr. Rui', detail: null, action: 'task' });
  });

  it('reunião: o local fica como detalhe, sem repetir o lead', () => {
    const v = describeNotification({ ...base, kind: 'reminder', title: '📅 Reunião às 10:00', text: 'O Quintal · Rua Direita' }, null);
    expect(v).toMatchObject({ label: 'Reunião', icon: 'meeting', title: 'Reunião às 10:00', detail: 'Rua Direita', action: null });
  });

  it('respostas: o nome sai do título; devolvidos a vermelho', () => {
    expect(describeNotification({ ...base, kind: 'reply', title: '💬 O Quintal respondeu', text: 'Re: Proposta' }, null)).toMatchObject({
      label: 'Resposta',
      tone: 'success',
      title: '“Re: Proposta”',
      detail: null,
      action: 'reply',
    });
    expect(describeNotification({ ...base, kind: 'reply', title: '📭 Email devolvido · O Quintal', text: 'a@b.pt não existe.' }, null)).toMatchObject({
      label: 'Email devolvido',
      tone: 'danger',
      title: 'a@b.pt não existe.',
      detail: null,
      action: null,
    });
    expect(describeNotification({ ...base, kind: 'reply', title: '🚫 O Quintal pediu para não ser contactado', text: 'Remover' }, null).title).toBe(
      'Pediu para não ser contactado',
    );
  });

  it('email aberto: o texto passa a título e "Ligar" só com telefone', () => {
    const n = { ...base, kind: 'email_open' as const, title: '📬 O Quintal', text: 'Abriu o email “Proposta”. Bom momento para ligar!' };
    expect(describeNotification(n, null)).toMatchObject({
      label: 'Email aberto',
      tone: 'info',
      title: 'Abriu o email “Proposta”.',
      detail: null,
      action: 'call',
    });
    expect(describeNotification({ ...n, lead: { ...lead, phone: null } }, null).action).toBeNull();
  });

  it('tarefas e menções: quem fez + texto entre aspas, sem o lead', () => {
    expect(describeNotification({ ...base, kind: 'task_assigned', text: 'Enviar proposta · #13 O Quintal' }, 'Rui')).toMatchObject({
      title: 'Rui deu-te uma tarefa',
      detail: '“Enviar proposta”',
      tone: 'warning',
    });
    expect(describeNotification({ ...base, kind: 'mention', title: 'Ana mencionou-te · #13 O Quintal', text: 'Vê isto' }, null).title).toBe('Ana mencionou-te');
  });

  it('pedidos do site e clientes a roxo', () => {
    expect(describeNotification({ ...base, kind: 'site_form', title: '📥 Novo pedido pelo site', text: 'Rui: quero um site' }, null)).toMatchObject({
      label: 'Pedido pelo site',
      tone: 'violet',
      title: 'Rui: quero um site',
      detail: null,
    });
    expect(describeNotification({ ...base, kind: 'client', title: '✍️ Contrato aceite', text: 'Rui aceitou "Site".' }, null).tone).toBe('violet');
  });
});

describe('stripLeadingEmoji / notificationDay', () => {
  it('tira emojis do início', () => {
    expect(stripLeadingEmoji('✍️ Contrato aceite')).toBe('Contrato aceite');
    expect(stripLeadingEmoji('Sem emoji ⏰')).toBe('Sem emoji ⏰');
  });

  it('agrupa pelo dia em Lisboa', () => {
    const now = new Date('2026-10-31T10:00:00Z');
    expect(notificationDay('2026-10-31T00:30:00Z', now)).toBe('today');
    expect(notificationDay('2026-10-30T23:30:00Z', now)).toBe('yesterday');
    expect(notificationDay('2026-10-27T12:00:00Z', now)).toBe('week');
    expect(notificationDay('2026-10-20T12:00:00Z', now)).toBe('older');
  });
});
