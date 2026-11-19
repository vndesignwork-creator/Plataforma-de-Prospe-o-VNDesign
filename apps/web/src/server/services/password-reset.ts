/**
 * Recuperar a palavra-passe: a plataforma gera o link e envia ela própria o
 * email (em português, com o remetente dos outros emails). A resposta é sempre
 * a mesma, exista ou não conta com aquele email.
 */
import { buildPasswordResetEmail } from '@vndesign/core';
import { createSupabaseAdminClient } from '../supabase-admin';
import { isMailConfigured, sendMail } from '../mailer';
import { reportProblem } from './platform';

// Pedidos recentes por email e por IP (a plataforma corre num processo só).
const hits = new Map<string, number[]>();

/** Limite em 15 minutos: 3 pedidos para o mesmo email (não se enche a caixa de
 * ninguém) e 20 do mesmo sítio (um escritório inteiro pode partilhar o IP). */
function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > max;
}

export type ResetResult = { ok: true } | { ok: false; status: number };

export async function sendPasswordReset(email: string, origin: string, ip: string | null): Promise<ResetResult> {
  const address = email.trim().toLowerCase();
  if (rateLimited(`email:${address}`, 3) || (ip && rateLimited(`ip:${ip}`, 20))) return { ok: false, status: 429 };
  const admin = createSupabaseAdminClient();
  // Sem SMTP configurado, o email sai pelo serviço de autenticação (em inglês,
  // como era antes) — mais vale isso do que ninguém conseguir entrar.
  if (!isMailConfigured()) {
    console.warn('[palavra-passe] SMTP não configurado: o email vai pelo serviço de autenticação.');
    await admin.auth.resetPasswordForEmail(address, { redirectTo: `${origin}/auth/callback?next=/nova-palavra-passe` });
    return { ok: true };
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: address,
    options: { redirectTo: `${origin}/auth/callback?next=/nova-palavra-passe` },
  });
  // Email sem conta (ou conta apagada): responde-se na mesma, sem dizer nada.
  if (error || !data?.properties?.action_link) return { ok: true };

  const name = (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? null;
  try {
    await sendMail({ to: address, ...buildPasswordResetEmail({ link: data.properties.action_link, name }) });
    return { ok: true };
  } catch (e) {
    // O nosso envio falhou (SMTP mal configurado, porta fechada, credenciais
    // mudadas…). Fica o registo em "Estado da plataforma" e o email sai pelo
    // serviço de autenticação: ninguém fica sem poder entrar por causa disto.
    const detail = e instanceof Error ? e.message : String(e);
    console.warn('[palavra-passe] não foi possível enviar o email', detail);
    await reportSendProblem(data.user?.id ?? null, detail);
    const { error: fallbackError } = await admin.auth.resetPasswordForEmail(address, {
      redirectTo: `${origin}/auth/callback?next=/nova-palavra-passe`,
    });
    if (fallbackError) {
      console.warn('[palavra-passe] o serviço de autenticação também não enviou', fallbackError.message);
      return { ok: false, status: 502 };
    }
    return { ok: true };
  }
}

/** Deixa o aviso em Definições → Estado da plataforma (sem travar o pedido). */
async function reportSendProblem(userId: string | null, detail: string): Promise<void> {
  if (!userId) return;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from('workspace_members').select('workspace_id').eq('user_id', userId).limit(1);
    const workspaceId = ((data ?? []) as { workspace_id: string }[])[0]?.workspace_id;
    if (!workspaceId) return;
    await reportProblem(workspaceId, {
      area: 'email',
      key: 'password_reset',
      title: 'O email para recuperar a palavra-passe não saiu pela plataforma',
      detail: `${detail} — o email foi enviado pelo serviço de autenticação (em inglês). Vê as definições de envio (SMTP) do servidor.`,
      notify: true,
    });
  } catch {
    // O aviso é extra: se falhar, não estraga o pedido.
  }
}
