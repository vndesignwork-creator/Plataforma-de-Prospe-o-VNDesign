/**
 * Leitura da caixa de entrada por IMAP (Gmail, Hostinger ou outro), só para
 * detetar respostas dos leads: lê apenas o cabeçalho de cada email novo
 * (remetente, assunto, data, Message-ID e In-Reply-To), nunca o texto.
 */
import { isAutoReply, type InboxMessage } from '@vndesign/core';
import { ImapFlow } from 'imapflow';
import { ApiError } from './http';
import type { ImapAccount } from './services/mail-account';

/** Máximo de emails lidos de cada vez (os mais recentes). */
const MAX_MESSAGES = 300;

export interface InboxRead {
  messages: InboxMessage[];
  uidValidity: number;
  lastUid: number;
}

/** Erros do IMAP em português (o mais comum: palavra-passe ou acesso IMAP). */
export function imapError(error: unknown, account: Pick<ImapAccount, 'host' | 'port'>): ApiError {
  const e = error as { authenticationFailed?: boolean; code?: string; responseText?: string; message?: string };
  if (e.authenticationFailed || /auth|login|credentials/i.test(e.responseText ?? '')) {
    return new ApiError(
      422,
      'A caixa de entrada recusou o acesso',
      account.host.includes('gmail')
        ? 'O Gmail recusou o email/palavra-passe na leitura da caixa de entrada. Confirma a palavra-passe de aplicação em Definições → Email de envio.'
        : 'Utilizador ou palavra-passe recusados pelo servidor IMAP. Confirma-os em Definições → Email de envio.',
    );
  }
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'NoConnection'].includes(e.code ?? '')) {
    return new ApiError(502, 'Caixa de entrada inacessível', `Não foi possível ligar a ${account.host}:${account.port} (IMAP).`);
  }
  return new ApiError(502, 'Não foi possível ler a caixa de entrada', e.responseText ?? e.message ?? 'Erro do servidor IMAP.');
}

/**
 * Emails novos da caixa de entrada desde a última leitura (UID), ou desde
 * `since` na primeira vez (ou se o servidor renumerou a caixa).
 */
export async function readInbox(account: ImapAccount, since: Date): Promise<InboxRead> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.user, pass: account.password },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  // Erros de ligação depois de ligado (ex.: o servidor fecha) não podem rebentar o processo.
  client.on('error', () => undefined);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const box = client.mailbox;
      if (!box) throw new Error('Caixa de entrada não encontrada');
      const uidValidity = Number(box.uidValidity);
      const uidNext = Number(box.uidNext ?? 1);
      const continuing = account.uidValidity === uidValidity && account.lastUid !== null;
      let uids = continuing
        ? ((await client.search({ uid: `${account.lastUid! + 1}:*` }, { uid: true })) || []).filter((u) => u > account.lastUid!)
        : (await client.search({ since }, { uid: true })) || [];
      uids = uids.sort((a, b) => a - b).slice(-MAX_MESSAGES);

      const messages: InboxMessage[] = [];
      if (uids.length) {
        for await (const msg of client.fetch(
          uids.join(','),
          { uid: true, envelope: true, internalDate: true, headers: ['auto-submitted'] },
          { uid: true },
        )) {
          const from = msg.envelope?.from?.[0];
          if (!from?.address) continue;
          const header = msg.headers?.toString('utf8').match(/^auto-submitted:\s*(.+)$/im)?.[1] ?? null;
          const subject = msg.envelope?.subject ?? '';
          const date = msg.envelope?.date ?? msg.internalDate ?? new Date();
          messages.push({
            from: from.address.toLowerCase(),
            fromName: from.name || null,
            subject,
            messageId: msg.envelope?.messageId ?? null,
            inReplyTo: msg.envelope?.inReplyTo ?? null,
            date: new Date(date).toISOString(),
            auto: isAutoReply(subject, header),
          });
        }
      }
      const lastUid = Math.max(account.lastUid ?? 0, uidNext - 1, ...uids);
      return { messages, uidValidity, lastUid };
    } finally {
      lock.release();
    }
  } catch (error) {
    throw error instanceof ApiError ? error : imapError(error, account);
  } finally {
    await client.logout().catch(() => client.close());
  }
}
