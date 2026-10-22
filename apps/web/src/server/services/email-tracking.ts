/**
 * Saber quando o lead abre um email enviado pela plataforma (imagem de 1×1) ou
 * carrega num dos links. A primeira abertura e o primeiro clique ficam na linha
 * do tempo e chegam como notificação; uma nova abertura volta a avisar ao fim
 * de 6 horas. Os pedidos do lead não têm sessão: usam a chave de serviço.
 *
 * Limites conhecidos: alguns programas de email (ex.: Apple Mail com proteção
 * de privacidade) abrem as imagens sozinhos, e quem bloqueia imagens nunca
 * conta como aberto.
 */
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addEmailTracking, type EmailTracking, type TodayOpenedEmail } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { requestOrigin } from '../request-origin';
import { createSupabaseAdminClient } from '../supabase-admin';
import { sendUserPush } from './push';
import { getSettings } from './workspace';

/**
 * Aberturas logo a seguir ao envio são do próprio servidor de email (verificação),
 * não do lead. EMAIL_TRACKING_GRACE_MS muda o tempo (testes).
 */
const graceMs = () => Number(process.env.EMAIL_TRACKING_GRACE_MS ?? 10_000);
/** Intervalo mínimo entre avisos do mesmo email. */
const RENOTIFY_MS = 6 * 3_600_000;
/** Programas que abrem links para verificar se são seguros (não são o lead). */
const SCANNER_UA = /bot|crawler|spider|preview|scanner|barracuda|proofpoint|mimecast|safelinks|urldefense|headless/i;

export interface PreparedTracking {
  html: string;
  /** Grava o registo (antes de enviar, para a primeira abertura nunca chegar primeiro). */
  save: () => Promise<string>;
  /** Apaga o registo se o envio falhar. */
  discard: () => Promise<void>;
}

/** HTML com o rastreio, ou null se estiver desligado (ou sem endereço público). */
export async function prepareTracking(
  ctx: ApiContext,
  leadId: string,
  subject: string,
  html: string,
): Promise<PreparedTracking | null> {
  if (!(await getSettings(ctx)).features.email_tracking) return null;
  const origin = await requestOrigin();
  if (!origin) return null;
  const token = randomBytes(18).toString('base64url');
  const tracked = addEmailTracking(html, `${origin}/api/v1/public/t/${token}`);
  let id: string | null = null;
  return {
    html: tracked.html,
    async save() {
      const { data, error } = await createSupabaseAdminClient()
        .from('email_tracking')
        .insert({
          workspace_id: ctx.workspaceId,
          lead_id: leadId,
          token,
          subject: subject.slice(0, 300),
          links: tracked.links,
          created_by: ctx.user.id,
        })
        .select('id')
        .single();
      if (error) throw fromPostgrest(error);
      id = data.id as string;
      return id;
    },
    async discard() {
      if (id) await createSupabaseAdminClient().from('email_tracking').delete().eq('id', id);
    },
  };
}

type TrackingRow = {
  id: string;
  workspace_id: string;
  lead_id: string;
  subject: string;
  links: string[];
  sent_at: string;
  opens: number;
  first_opened_at: string | null;
  clicks: number;
  first_clicked_at: string | null;
  notified_at: string | null;
  created_by: string | null;
};

async function loadByToken(token: string): Promise<TrackingRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await createSupabaseAdminClient()
    .from('email_tracking')
    .select('id, workspace_id, lead_id, subject, links, sent_at, opens, first_opened_at, clicks, first_clicked_at, notified_at, created_by')
    .eq('token', token)
    .maybeSingle();
  return (data as TrackingRow | null) ?? null;
}

async function leadName(leadId: string): Promise<{ company_name: string; number: number } | null> {
  const { data } = await createSupabaseAdminClient().from('leads').select('company_name, number').eq('id', leadId).maybeSingle();
  return (data as { company_name: string; number: number } | null) ?? null;
}

/** Linha do tempo + notificação ao autor do email (respeitando o intervalo entre avisos). */
async function announce(row: TrackingRow, kind: 'opened' | 'clicked', now: Date, url?: string) {
  const admin = createSupabaseAdminClient();
  const first = kind === 'opened' ? row.first_opened_at === null : row.first_clicked_at === null;
  if (first) {
    await admin.from('lead_activities').insert({
      workspace_id: row.workspace_id,
      lead_id: row.lead_id,
      type: kind === 'opened' ? 'email_opened' : 'email_clicked',
      body: row.subject,
      payload: { tracking_id: row.id, ...(url ? { url } : {}) },
    });
  }
  const due = first || !row.notified_at || now.getTime() - new Date(row.notified_at).getTime() >= RENOTIFY_MS;
  if (!due || !row.created_by) return;
  await admin.from('email_tracking').update({ notified_at: now.toISOString() }).eq('id', row.id);
  const lead = await leadName(row.lead_id);
  if (!lead) return;
  const body =
    kind === 'clicked'
      ? `Carregou num link do email “${row.subject}”. Bom momento para ligar!`
      : first
        ? `Abriu o email “${row.subject}”. Bom momento para ligar!`
        : `Voltou a abrir o email “${row.subject}”.`;
  await sendUserPush(row.workspace_id, row.created_by, {
    title: `📬 ${lead.company_name}`,
    body,
    url: `/leads/${row.lead_id}`,
    tag: `email-${row.id}`,
  }).catch(() => undefined);
}

/** Pedido da imagem de 1×1: conta uma abertura. */
export async function recordOpen(token: string, userAgent: string | null, now = new Date()): Promise<void> {
  const row = await loadByToken(token);
  if (!row || now.getTime() - new Date(row.sent_at).getTime() < graceMs()) return;
  if (userAgent && SCANNER_UA.test(userAgent) && !/GoogleImageProxy/i.test(userAgent)) return;
  await createSupabaseAdminClient()
    .from('email_tracking')
    .update({ opens: row.opens + 1, first_opened_at: row.first_opened_at ?? now.toISOString(), last_opened_at: now.toISOString() })
    .eq('id', row.id);
  await announce(row, 'opened', now);
}

/** Clique num link: conta e devolve o endereço original (null = link desconhecido). */
export async function recordClick(token: string, index: number, userAgent: string | null, now = new Date()): Promise<string | null> {
  const row = await loadByToken(token);
  const url = row?.links[index];
  if (!row || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  if ((userAgent && SCANNER_UA.test(userAgent)) || now.getTime() - new Date(row.sent_at).getTime() < graceMs()) return url;
  // Um clique também prova que o email foi aberto (mesmo com as imagens bloqueadas).
  await createSupabaseAdminClient()
    .from('email_tracking')
    .update({
      clicks: row.clicks + 1,
      first_clicked_at: row.first_clicked_at ?? now.toISOString(),
      last_clicked_at: now.toISOString(),
      ...(row.first_opened_at ? {} : { first_opened_at: now.toISOString(), last_opened_at: now.toISOString(), opens: Math.max(row.opens, 1) }),
    })
    .eq('id', row.id);
  await announce(row, 'clicked', now, url);
  return url;
}

/** Emails do lead com as aberturas (para a ficha). */
export async function listEmailTracking(ctx: ApiContext, leadId: string): Promise<EmailTracking[]> {
  const { data, error } = await ctx.supabase
    .from('email_tracking')
    .select('id, subject, sent_at, opens, first_opened_at, last_opened_at, clicks, last_clicked_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: false })
    .limit(50);
  if (error) throw fromPostgrest(error);
  return (data ?? []) as EmailTracking[];
}

/** Leads em pipeline que abriram um email nas últimas 48 horas (o mais recente de cada um). */
export async function fetchRecentlyOpened(client: SupabaseClient, workspaceId: string, limit = 8): Promise<TodayOpenedEmail[]> {
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data, error } = await client
    .from('email_tracking')
    .select('id, subject, opens, clicks, last_opened_at, lead:leads!inner(id, number, company_name, phone, status, archived_at)')
    .eq('workspace_id', workspaceId)
    .gte('last_opened_at', since)
    .order('last_opened_at', { ascending: false })
    .limit(50);
  // Antes da migração 20261102000100 a tabela não existe.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
  if (error) throw fromPostgrest(error);
  const seen = new Set<string>();
  const out: TodayOpenedEmail[] = [];
  for (const row of (data ?? []) as unknown as (TodayOpenedEmail & { lead: TodayOpenedEmail['lead'] & { archived_at: string | null } })[]) {
    const { archived_at, ...lead } = row.lead;
    if (archived_at || seen.has(lead.id) || ['cliente', 'sem_interesse'].includes(lead.status)) continue;
    seen.add(lead.id);
    out.push({ ...row, lead });
    if (out.length >= limit) break;
  }
  return out;
}
