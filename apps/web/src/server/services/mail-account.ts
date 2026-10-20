/**
 * Conta de envio do utilizador (Definições → Email de envio): Gmail, Hostinger
 * ou outro SMTP. A palavra-passe fica cifrada e nunca é devolvida.
 */
import net from 'node:net';
import { MAIL_PROVIDER_PRESETS, type MailAccount, type MailAccountUpsert } from '@vndesign/core';
import { openSecret, sealSecret } from '../ai/secret-box';
import { isPrivateAddress } from '../audit/safe-request';
import type { ApiContext } from '../context';
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
};
const SELECT = 'provider, from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user, password_ciphertext, daily_limit, bcc_self';

async function getRow(ctx: ApiContext): Promise<Row | null> {
  const { data, error } = await ctx.supabase
    .from('mail_accounts')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  // Antes da migração 20261026000100 a tabela não existe.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return null;
  if (error) throw fromPostgrest(error);
  return data as Row | null;
}

/** Emails enviados pela plataforma nas últimas 24 horas (limite diário). */
export async function sentLast24h(ctx: ApiContext): Promise<number> {
  const { count, error } = await ctx.supabase
    .from('lead_activities')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId)
    .eq('actor_user_id', ctx.user.id)
    .eq('type', 'email_sent')
    .eq('payload->>via', 'platform')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());
  if (error) throw fromPostgrest(error);
  return count ?? 0;
}

export async function getMailAccount(ctx: ApiContext): Promise<MailAccount | null> {
  const row = await getRow(ctx);
  if (!row) return null;
  const { password_ciphertext, ...rest } = row;
  return { ...rest, password_set: !!password_ciphertext, sent_today: await sentLast24h(ctx) };
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
  };
  const { error } = await ctx.supabase.from('mail_accounts').upsert(row, { onConflict: 'workspace_id,user_id' });
  if (error) throw fromPostgrest(error);
  return (await getMailAccount(ctx))!;
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
