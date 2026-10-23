/**
 * Conta de envio do utilizador (Definições → Email de envio): Gmail, Hostinger
 * ou outro SMTP. A palavra-passe fica cifrada e nunca é devolvida.
 */
import net from 'node:net';
import { MAIL_PROVIDER_PRESETS, type MailAccount, type MailAccountUpsert } from '@vndesign/core';
import { openSecret, sealSecret } from '../ai/secret-box';
import { isPrivateAddress } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { createSupabaseAdminClient } from '../supabase-admin';
import { ApiError, fromPostgrest } from '../http';
import { sendWithAccount, type SmtpAccount } from '../mailer';

type Row = {
  provider: MailAccount['provider'];
  from_name: string;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string | null;
  password_ciphertext: string | null;
  daily_limit: number;
  bcc_self: boolean;
  reply_detection: boolean;
  imap_host: string | null;
  imap_port: number | null;
  imap_checked_at: string | null;
  imap_error: string | null;
  imap_uid_validity: number | string | null;
  imap_last_uid: number | string | null;
};
const SELECT =
  'provider, from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user, password_ciphertext, daily_limit, bcc_self, reply_detection, imap_host, imap_port, imap_checked_at, imap_error, imap_uid_validity, imap_last_uid';

// Antes da migração 20261028000100 (sem a leitura da caixa de entrada): continua a enviar.
const LEGACY_SELECT = 'provider, from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user, password_ciphertext, daily_limit, bcc_self';
const LEGACY_DEFAULTS = {
  reply_detection: false,
  imap_host: null,
  imap_port: null,
  imap_checked_at: null,
  imap_error: null,
  imap_uid_validity: null,
  imap_last_uid: null,
};

/** O prospetor envia pela conta do dono do workspace (os clientes veem o email da empresa). */
async function accountOwner(ctx: ApiContext): Promise<string | null> {
  if (ctx.role !== 'prospector') return null;
  const { data } = await createSupabaseAdminClient().from('workspace_members').select('user_id').eq('workspace_id', ctx.workspaceId).eq('role', 'owner').limit(1).maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

async function getRow(ctx: ApiContext): Promise<Row | null> {
  const owner = await accountOwner(ctx);
  const client = owner ? createSupabaseAdminClient() : ctx.supabase;
  const query = (select: string) =>
    client.from('mail_accounts').select(select).eq('workspace_id', ctx.workspaceId).eq('user_id', owner ?? ctx.user.id).maybeSingle();
  let { data, error } = await query(SELECT);
  let legacy = false;
  if (error?.code === '42703') {
    ({ data, error } = await query(LEGACY_SELECT));
    legacy = true;
  }
  // Antes da migração 20261026000100 a tabela não existe.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return null;
  if (error) throw fromPostgrest(error);
  if (!data) return null;
  return (legacy ? { ...(data as object), ...LEGACY_DEFAULTS } : data) as Row;
}

/** Emails enviados pela plataforma nas últimas 24 horas (limite diário). */
export async function sentLast24h(ctx: ApiContext): Promise<number> {
  // Com a conta do dono partilhada pela equipa, o limite diário conta os emails de todos.
  const shared = ctx.role === 'prospector';
  let query = ctx.supabase
    .from('lead_activities')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId);
  if (!shared) query = query.eq('actor_user_id', ctx.user.id);
  const { count, error } = await query
    .eq('type', 'email_sent')
    .eq('payload->>via', 'platform')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());
  if (error) throw fromPostgrest(error);
  return count ?? 0;
}

export async function getMailAccount(ctx: ApiContext): Promise<MailAccount | null> {
  const row = await getRow(ctx);
  if (!row) return null;
  return {
    provider: row.provider,
    from_name: row.from_name,
    from_email: row.from_email,
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_secure: row.smtp_secure,
    smtp_user: row.smtp_user,
    daily_limit: row.daily_limit,
    bcc_self: row.bcc_self,
    reply_detection: row.reply_detection,
    imap_host: row.imap_host,
    imap_port: row.imap_port,
    imap_checked_at: row.imap_checked_at,
    imap_error: row.imap_error,
    password_set: !!row.password_ciphertext,
    sent_today: await sentLast24h(ctx),
  };
}

/** Servidor próprio (Outro): em produção nunca endereços internos. */
function assertPublicHost(host: string) {
  if (process.env.NODE_ENV !== 'production' || process.env.SMTP_ALLOW_PRIVATE_HOST === '1') return;
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || (net.isIP(h) && isPrivateAddress(h))) {
    throw new ApiError(422, 'Servidor não permitido', 'Usa o endereço público do servidor SMTP.', {
      errors: { smtp_host: ['Usa o endereço público do servidor SMTP.'] },
    });
  }
}

export async function saveMailAccount(ctx: ApiContext, input: MailAccountUpsert): Promise<MailAccount> {
  const current = await getRow(ctx);
  const preset = MAIL_PROVIDER_PRESETS[input.provider];
  const custom = input.provider === 'custom';
  const host = custom ? (input.smtp_host ?? '') : preset.host;
  if (custom) assertPublicHost(host);
  // Gmail e Hostinger: o utilizador SMTP é o próprio email.
  const user = custom ? (input.smtp_user || null) : input.from_email;
  const password = input.password ?? null;
  if (!password && !current?.password_ciphertext && user) {
    throw new ApiError(422, 'Falta a palavra-passe', 'Indica a palavra-passe da conta de email.', {
      errors: { password: ['Indica a palavra-passe.'] },
    });
  }
  const row = {
    workspace_id: ctx.workspaceId,
    user_id: ctx.user.id,
    provider: input.provider,
    from_name: input.from_name,
    from_email: input.from_email,
    smtp_host: host,
    smtp_port: custom ? (input.smtp_port ?? preset.port) : preset.port,
    smtp_secure: custom ? (input.smtp_secure ?? preset.secure) : preset.secure,
    smtp_user: user,
    password_ciphertext: password ? sealSecret(password) : (current?.password_ciphertext ?? null),
    daily_limit: input.daily_limit,
    bcc_self: input.bcc_self ?? preset.bccSelf,
    reply_detection: input.reply_detection ?? current?.reply_detection ?? true,
    imap_host: custom ? input.imap_host || imapHostFor(host) : null,
    imap_port: custom ? (input.imap_port ?? preset.imapPort) : null,
    // Outra caixa de correio: volta a ler a caixa de entrada desde o início.
    ...(current && (current.from_email !== input.from_email || current.provider !== input.provider)
      ? { imap_uid_validity: null, imap_last_uid: null, imap_checked_at: null, imap_error: null }
      : {}),
  };
  if (custom && row.imap_host) assertPublicHost(row.imap_host);
  const { error } = await ctx.supabase.from('mail_accounts').upsert(row, { onConflict: 'workspace_id,user_id' });
  if (error) throw fromPostgrest(error);
  return (await getMailAccount(ctx))!;
}

/** "smtp.exemplo.pt" → "imap.exemplo.pt" (o habitual nos alojamentos). */
function imapHostFor(smtpHost: string): string {
  return smtpHost.replace(/^smtp\./i, 'imap.');
}

/** Dados para ler a caixa de entrada (só no servidor). */
export interface ImapAccount {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  uidValidity: number | null;
  lastUid: number | null;
}

/** A caixa de entrada pronta a ler, ou null (sem conta, desligado ou sem palavra-passe). */
export async function loadImapAccount(ctx: ApiContext): Promise<ImapAccount | null> {
  const row = await getRow(ctx);
  if (!row?.reply_detection || !row.password_ciphertext) return null;
  const password = openSecret(row.password_ciphertext);
  if (!password) return null;
  const preset = MAIL_PROVIDER_PRESETS[row.provider];
  const host = row.provider === 'custom' ? row.imap_host || imapHostFor(row.smtp_host) : preset.imapHost;
  const port = row.provider === 'custom' ? (row.imap_port ?? preset.imapPort) : preset.imapPort;
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    host,
    port,
    // 993 = SSL direto; outras portas (143) usam STARTTLS se o servidor o tiver.
    secure: port === 993,
    user: row.smtp_user || row.from_email,
    password,
    fromEmail: row.from_email,
    uidValidity: num(row.imap_uid_validity),
    lastUid: num(row.imap_last_uid),
  };
}

/** Guarda onde ficou a leitura da caixa de entrada (e o erro, se houve). */
export async function saveImapState(
  ctx: ApiContext,
  patch: { imap_uid_validity?: number | null; imap_last_uid?: number | null; imap_error: string | null },
) {
  const { error } = await ctx.supabase
    .from('mail_accounts')
    .update({ ...patch, imap_checked_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id);
  if (error) throw fromPostgrest(error);
}

export async function deleteMailAccount(ctx: ApiContext): Promise<void> {
  const { error } = await ctx.supabase.from('mail_accounts').delete().eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id);
  if (error) throw fromPostgrest(error);
}

/** A conta pronta a usar (só no servidor). */
export async function loadSmtpAccount(ctx: ApiContext): Promise<{ account: SmtpAccount; dailyLimit: number; bccSelf: boolean }> {
  const row = await getRow(ctx);
  if (!row) {
    throw new ApiError(422, 'Sem conta de email', 'Liga a tua conta em Definições → Email de envio para enviar pela plataforma.');
  }
  const password = row.password_ciphertext ? openSecret(row.password_ciphertext) : null;
  if (row.password_ciphertext && !password) {
    throw new ApiError(
      422,
      'Palavra-passe ilegível',
      'Não foi possível abrir a palavra-passe do email (a chave de cifra do servidor mudou?). Cola-a outra vez em Definições → Email de envio.',
    );
  }
  return {
    account: {
      fromName: row.from_name,
      fromEmail: row.from_email,
      host: row.smtp_host,
      port: row.smtp_port,
      secure: row.smtp_secure,
      user: row.smtp_user,
      password,
    },
    dailyLimit: row.daily_limit,
    bccSelf: row.bcc_self,
  };
}

/** Erros do SMTP em português (o mais comum: palavra-passe errada no Gmail). */
export function smtpError(error: unknown, account: SmtpAccount): ApiError {
  const e = error as { code?: string; responseCode?: number; message?: string };
  const gmail = account.host.includes('gmail');
  if (e.code === 'EAUTH' || e.responseCode === 535 || e.responseCode === 534) {
    return new ApiError(
      422,
      'O servidor de email recusou o acesso',
      gmail
        ? 'O Gmail recusou o email/palavra-passe. Usa uma palavra-passe de aplicação (myaccount.google.com/apppasswords), não a palavra-passe normal.'
        : 'Utilizador ou palavra-passe errados. Confirma-os em Definições → Email de envio.',
    );
  }
  if (e.code === 'EENVELOPE' || e.responseCode === 550 || e.responseCode === 553) {
    return new ApiError(422, 'Endereço recusado', `O servidor recusou o destinatário ou o remetente: ${e.message ?? ''}`.trim());
  }
  if (e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET' || e.code === 'EDNS') {
    return new ApiError(502, 'Servidor de email inacessível', `Não foi possível ligar a ${account.host}:${account.port}. Confirma o servidor e a porta.`);
  }
  if (e.responseCode === 421 || e.responseCode === 450 || e.responseCode === 451 || e.responseCode === 452) {
    return new ApiError(429, 'Envio adiado pelo servidor', 'O servidor de email pediu para tentar mais tarde (limite de envios?).');
  }
  console.error('[email] erro ao enviar', e.code, e.responseCode, e.message);
  return new ApiError(502, 'Não foi possível enviar', e.message ?? 'Erro do servidor de email.');
}

/** Email de teste para o próprio. */
export async function sendTestEmail(ctx: ApiContext): Promise<{ sent_to: string }> {
  const { account } = await loadSmtpAccount(ctx);
  const text = 'Olá!\n\nEste é um email de teste da VNDesign Leads. Se o recebeste, a tua conta está pronta para enviar emails aos leads.\n\nAté já.';
  try {
    await sendWithAccount(account, {
      to: account.fromEmail,
      subject: 'Teste — VNDesign Leads',
      text,
      html: `<p>${text.replace(/\n\n/g, '</p><p>')}</p>`,
    });
  } catch (error) {
    throw smtpError(error, account);
  }
  return { sent_to: account.fromEmail };
}
