/**
 * Leitura da caixa de entrada por IMAP (Gmail, Hostinger ou outro), só para
 * detetar respostas dos leads: lê o cabeçalho de cada email novo (remetente,
 * assunto, data, Message-ID e In-Reply-To) e o início do texto apenas dos
 * avisos de devolução e das respostas de leads (`wantText`).
 */
import { isAutoReply, isBounce, type InboxMessage } from '@vndesign/core';
import { ImapFlow, type MessageStructureObject } from 'imapflow';
import { ApiError } from './http';
import type { ImapAccount } from './services/mail-account';

/** Máximo de emails lidos de cada vez (os mais recentes). */
const MAX_MESSAGES = 300;
/** Do texto, só o início (chega para a resposta e para o relatório de devolução). */
const MAX_TEXT_BYTES = 32 * 1024;
/** No máximo, textos lidos de cada vez. */
const MAX_TEXTS = 60;

/** As partes a ler: num aviso de devolução, o relatório e o texto; numa resposta, o texto (ou o HTML). */
export function textParts(node: MessageStructureObject | undefined, bounce: boolean): string[] {
  if (!node) return [];
  const all: MessageStructureObject[] = [];
  const walk = (n: MessageStructureObject) => {
    if (n.childNodes?.length) n.childNodes.forEach(walk);
    else all.push(n);
  };
  walk(node);
  const id = (n: MessageStructureObject) => n.part ?? '1';
  const inline = (n: MessageStructureObject) => n.disposition !== 'attachment';
  const plain = all.find((n) => n.type === 'text/plain' && inline(n));
  const html = all.find((n) => n.type === 'text/html' && inline(n));
  if (bounce) {
    const report = all.filter((n) => /delivery-status|rfc822-headers/.test(n.type));
    return [...report.map(id), ...(plain ? [id(plain)] : [])];
  }
  return plain ? [id(plain)] : html ? [id(html)] : [];
}

function decode(buffer: Buffer, charset: string | undefined, html: boolean): string {
  let text: string;
  try {
    text = new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch {
    text = buffer.toString('utf8');
  }
  return html ? text.replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ') : text;
}

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
export async function readInbox(account: ImapAccount, since: Date, wantText?: (message: InboxMessage) => boolean): Promise<InboxRead> {
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
      const structures = new Map<number, MessageStructureObject | undefined>();
      if (uids.length) {
        for await (const msg of client.fetch(
          uids.join(','),
          { uid: true, envelope: true, internalDate: true, headers: ['auto-submitted'], bodyStructure: true },
          { uid: true },
        )) {
          const from = msg.envelope?.from?.[0];
          if (!from?.address) continue;
          const header = msg.headers?.toString('utf8').match(/^auto-submitted:\s*(.+)$/im)?.[1] ?? null;
          const subject = msg.envelope?.subject ?? '';
          const date = msg.envelope?.date ?? msg.internalDate ?? new Date();
          structures.set(msg.uid, msg.bodyStructure);
          messages.push({
            uid: msg.uid,
            from: from.address.toLowerCase(),
            fromName: from.name || null,
            subject,
            messageId: msg.envelope?.messageId ?? null,
            inReplyTo: msg.envelope?.inReplyTo ?? null,
            date: new Date(date).toISOString(),
            auto: isAutoReply(subject, header),
            bounce: isBounce(from.address, subject),
          });
        }
        // O texto só dos que interessam (depois do FETCH: o IMAP não aceita outro comando a meio).
        for (const message of messages.filter((m) => wantText?.(m)).slice(-MAX_TEXTS)) {
          const parts = textParts(structures.get(message.uid!), !!message.bounce);
          if (!parts.length) continue;
          try {
            const got = await client.downloadMany(String(message.uid), parts, { uid: true, maxBytes: MAX_TEXT_BYTES });
            message.text = parts
              .map((part) => {
                const p = got[part];
                return p?.content ? decode(p.content, p.meta.charset, /html/.test(p.meta.contentType ?? '')) : '';
              })
              .join('\n')
              .slice(0, MAX_TEXT_BYTES);
          } catch {
            message.text = null;
          }
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
