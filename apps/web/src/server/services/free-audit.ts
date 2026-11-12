/**
 * "Analisar o meu site grátis" (/analise/<código> e plugin de WordPress): o visitante escreve
 * o site e o email, entra como lead quente (canal "Formulário do site", "Ligar: pediu a
 * análise…" para hoje), o site é analisado em segundo plano e o diagnóstico em PDF segue por
 * email (pelo email de envio do dono). Se não for possível enviar, o dono é avisado.
 *
 * Também: o resumo do resultado no ecrã (pelo "pedido" assinado), confirmar se o site abre,
 * o PDF de exemplo, os números do mês, o follow-up automático e o Cloudflare Turnstile.
 */
import { randomBytes } from 'node:crypto';
import {
  FreeAuditSubmitSchema,
  LeadCreateSchema,
  LeadEmailSendSchema,
  freeAuditEmail,
  freeAuditFollowUpEmail,
  freeAuditSourceKey,
  freeAuditSourceLabel,
  freeAuditSummary,
  leadPath,
  normalizeEmail,
  replySubject,
  todayIso,
  websiteKey,
  type FreeAuditConfig,
  type FreeAuditSettings,
  type FreeAuditStatus,
  type SiteAudit,
  isOlderVersion,
  type FreeAuditPluginSites,
  freeAuditViewSite,
  type FreeAuditFormStats,
} from '@vndesign/core';
import { WP_PLUGIN_VERSION } from '../wp-plugin/plugin-files.generated';
import { keyHint, openSecret, sealSecret, signValue, verifySigned } from '../ai/secret-box';
import { AuditRequestError, safeGet } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { renderDiagnosisPdf } from '../proposals/diagnosis-pdf';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { createActivity } from './activities';
import { runLeadAudit } from './audits';
import { sendLeadEmail } from './lead-email';
import { createLead, updateLead } from './leads';
import { alertUser } from './push';
import { loadServiceCatalog } from './service-catalog';
import { getSettings, getSignature } from './workspace';

const NEXT_ACTION = 'Ligar: pediu a análise grátis do site';
const EMAIL_TEMPLATE = 'Análise grátis do site';
const FOLLOW_UP_TEMPLATE = 'Análise grátis: follow-up';
const REQUEST_PURPOSE = 'free-audit-request';

function assertManager(ctx: ApiContext) {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem permissão', 'Só o dono ou um administrador pode mudar a análise grátis.');
}

async function saveFreeAudit(ctx: ApiContext, next: FreeAuditSettings): Promise<FreeAuditSettings> {
  const current = await getSettings(ctx);
  const { error } = await ctx.supabase.from('workspaces').update({ settings: { ...current, free_audit: next } }).eq('id', ctx.workspaceId);
  if (error) throw fromPostgrest(error);
  return next;
}

/** Ligar/desligar (ou trocar o código). Só o dono ou um administrador. */
export async function setFreeAudit(ctx: ApiContext, input: { enabled: boolean; rotate: boolean }): Promise<FreeAuditSettings> {
  assertManager(ctx);
  const current = (await getSettings(ctx)).free_audit;
  const token = !input.enabled ? null : input.rotate || !current.token ? randomBytes(18).toString('base64url') : current.token;
  return saveFreeAudit(ctx, { ...current, token });
}

/** Follow-up automático e Cloudflare Turnstile. A chave secreta fica cifrada. */
export async function setFreeAuditConfig(ctx: ApiContext, input: FreeAuditConfig): Promise<FreeAuditSettings> {
  assertManager(ctx);
  const current = (await getSettings(ctx)).free_audit;
  const next: FreeAuditSettings = { ...current };
  if (input.follow_up_days !== undefined) next.follow_up_days = input.follow_up_days;
  if (input.turnstile_site_key !== undefined) next.turnstile_site_key = input.turnstile_site_key || null;
  if (input.turnstile_secret !== undefined) {
    next.turnstile_secret = input.turnstile_secret ? sealSecret(input.turnstile_secret) : null;
    next.turnstile_secret_hint = input.turnstile_secret ? keyHint(input.turnstile_secret) : null;
  }
  // Sem uma das duas chaves, a proteção não funciona: ficam as duas ou nenhuma.
  if (!next.turnstile_site_key || !next.turnstile_secret) {
    if (input.turnstile_site_key === null || input.turnstile_secret === null) {
      next.turnstile_site_key = null;
      next.turnstile_secret = null;
      next.turnstile_secret_hint = null;
    }
  }
  return saveFreeAudit(ctx, next);
}

const validToken = (t: string) => /^[A-Za-z0-9_-]{16,64}$/.test(t);

async function workspaceFor(token: string): Promise<{ id: string; settings: FreeAuditSettings } | null> {
  if (!validToken(token)) return null;
  const { data } = await createSupabaseAdminClient().from('workspaces').select('id, settings').eq('settings->free_audit->>token', token).maybeSingle();
  if (!data) return null;
  const fa = ((data.settings as { free_audit?: Partial<FreeAuditSettings> } | null)?.free_audit ?? {}) as Partial<FreeAuditSettings>;
  return {
    id: data.id as string,
    settings: {
      token: fa.token ?? null,
      follow_up_days: fa.follow_up_days === undefined ? 3 : fa.follow_up_days,
      turnstile_site_key: fa.turnstile_site_key ?? null,
      turnstile_secret: fa.turnstile_secret ?? null,
      turnstile_secret_hint: fa.turnstile_secret_hint ?? null,
    },
  };
}

/** Para a página pública e o plugin: quem oferece a análise e a chave pública do Turnstile. */
/** O código da página existe e a análise grátis está ligada? (para descarregar o plugin sem login) */
export async function freeAuditTokenActive(token: string): Promise<boolean> {
  return (await workspaceFor(token)) !== null;
}

export async function freeAuditPage(token: string): Promise<{ company: string | null; turnstile_site_key: string | null } | null> {
  const ws = await workspaceFor(token);
  if (!ws) return null;
  const ctx = await systemContext(ws.id, null);
  if (!ctx) return null;
  const signature = await getSignature(ctx).catch(() => null);
  const turnstile = ws.settings.turnstile_site_key && ws.settings.turnstile_secret ? ws.settings.turnstile_site_key : null;
  return { company: signature?.company?.trim() || signature?.full_name?.trim() || null, turnstile_site_key: turnstile };
}

// Contra spam: N pedidos por janela, por endereço.
const hits = new Map<string, number[]>();
function rateLimited(key: string, max = 3, windowMs = 30 * 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > max;
}

/** Cloudflare Turnstile: true se a resposta do visitante for válida. */
async function turnstileOk(secret: string, response: string | undefined, ip: string | null): Promise<boolean> {
  if (!response) return false;
  try {
    const body = new URLSearchParams({ secret, response, ...(ip ? { remoteip: ip } : {}) });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return data?.success === true;
  } catch {
    // Sem resposta da Cloudflare: não se perde o pedido de uma pessoa por isso.
    return true;
  }
}

export type FreeAuditResult =
  | { ok: true; message: string; request?: string }
  | { ok: false; status: number; message: string; errors?: Record<string, string[]> };
const THANKS = 'Obrigado! Estamos a analisar o seu site: vai receber a análise por email dentro de alguns minutos.';

export async function submitFreeAudit(token: string, fields: Record<string, unknown>, meta: { ip: string | null }): Promise<FreeAuditResult> {
  // Robôs preenchem o campo escondido: responde-se como se tivesse corrido bem.
  if (typeof fields._gotcha === 'string' && fields._gotcha.trim()) return { ok: true, message: THANKS };
  const ws = await workspaceFor(token);
  if (!ws) return { ok: false, status: 404, message: 'Esta página não existe ou foi desligada.' };
  if (rateLimited(`${token}:${meta.ip ?? '?'}`)) return { ok: false, status: 429, message: 'Demasiados pedidos. Tente daqui a alguns minutos.' };
  // Formulário HTML normal: a origem e o Turnstile vêm em campos soltos.
  const source = typeof fields.source === 'object' && fields.source ? fields.source : Object.fromEntries(Object.entries(fields).filter(([k]) => /^(page|referrer|utm_\w+)$/.test(k)));
  const turnstile = typeof fields.turnstile === 'string' ? fields.turnstile : typeof fields['cf-turnstile-response'] === 'string' ? fields['cf-turnstile-response'] : undefined;
  const parsed = FreeAuditSubmitSchema.safeParse({ ...fields, source, turnstile, consent: fields.consent === true || fields.consent === 'on' || fields.consent === 'true' });
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (errors[String(issue.path[0] ?? 'form')] ??= []).push(issue.message);
    return { ok: false, status: 422, message: 'Verifique os campos assinalados.', errors };
  }
  const input = parsed.data;
  const secret = ws.settings.turnstile_site_key && ws.settings.turnstile_secret ? openSecret(ws.settings.turnstile_secret) : null;
  if (secret && !(await turnstileOk(secret, input.turnstile, meta.ip))) {
    return { ok: false, status: 422, message: 'Confirme que não é um robô e envie outra vez.', errors: { turnstile: ['Confirme que não é um robô.'] } };
  }
  // Endereços locais (IP, localhost) só nos testes; em produção não há site para analisar.
  const rawHost = new URL(input.website).hostname;
  if (process.env.AUDIT_ALLOW_PRIVATE !== '1' && (rawHost === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawHost))) {
    return { ok: false, status: 422, message: 'Verifique os campos assinalados.', errors: { website: ['Endereço inválido (ex.: www.o-meu-negocio.pt).'] } };
  }
  const ctx = await systemContext(ws.id, null);
  if (!ctx) return { ok: false, status: 404, message: 'Esta página não existe.' };

  const host = rawHost.replace(/^www\./, '');
  const company = input.company ?? host;
  let leadId: string;
  let created = true;
  try {
    // Já é lead (mesmo email ou mesmo site)? Junta o pedido a esse.
    const email = normalizeEmail(input.email);
    const { data: byEmail } = email
      ? await ctx.supabase.from('leads').select('id').eq('workspace_id', ctx.workspaceId).eq('email_normalized', email).is('anonymized_at', null).limit(1).maybeSingle()
      : { data: null };
    // Pela chave do site (como na deteção de duplicados); um IP não identifica um negócio.
    const siteKey = websiteKey(input.website);
    const { data: bySite } =
      byEmail || !siteKey || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(siteKey)
        ? { data: null }
        : await ctx.supabase.from('leads').select('id').eq('workspace_id', ctx.workspaceId).eq('website_key', siteKey).is('anonymized_at', null).limit(1).maybeSingle();
    const existing = (byEmail ?? bySite) as { id: string } | null;
    if (existing) {
      leadId = existing.id;
      created = false;
      await updateLead(ctx, leadId, { next_action_on: todayIso(), next_action_text: NEXT_ACTION });
    } else {
      const lead = LeadCreateSchema.parse({
        company_name: company,
        contact_name: input.name,
        email: input.email,
        website: input.website,
        channel: 'site',
        status: 'respondeu',
        next_action_text: NEXT_ACTION,
        next_action_on: todayIso(),
      });
      leadId = (await createLead(ctx, lead, { force: true, origin: 'free_audit' })).id;
    }
  } catch (error) {
    const extra = (error instanceof ApiError ? error.extra : null) as { do_not_contact?: unknown[] } | null;
    if (extra?.do_not_contact) return { ok: true, message: THANKS };
    console.error('[análise grátis] lead', error instanceof Error ? error.message : error);
    return { ok: false, status: 500, message: 'Não foi possível enviar o pedido. Tente outra vez daqui a pouco.' };
  }

  const startedAt = new Date().toISOString();
  const origin = freeAuditSourceLabel(input.source);
  await createActivity(ctx, leadId, {
    type: 'note',
    body: `🔎 Pediu a análise grátis do site (${host}) pela tua página${input.name ? ` — ${input.name}` : ''} <${input.email}>.${origin ? `\nOrigem: ${origin}.` : ''}`,
    payload: { via: 'site_form', free_audit: true, created, source: input.source ?? null, source_key: freeAuditSourceKey(input.source) },
  }).catch(() => undefined);

  // Em segundo plano: analisar, enviar o PDF e avisar (o visitante não fica à espera).
  void finishFreeAudit(ctx, leadId, input.website, input.email, input.name, company, host);
  return { ok: true, message: THANKS, request: signValue(`${ws.id}.${leadId}.${startedAt}`, REQUEST_PURPOSE) };
}

async function finishFreeAudit(ctx: ApiContext, leadId: string, website: string, to: string, name: string | null, company: string, host: string) {
  let problem: string | null = null;
  try {
    await runLeadAudit(ctx, leadId, website);
  } catch (error) {
    problem = `não foi possível analisar o site (${error instanceof Error ? error.message : 'erro'})`;
  }
  let sent = false;
  if (!problem) {
    try {
      const settings = await getSettings(ctx);
      if (!settings.features.diagnosis_report) throw new ApiError(422, 'Relatório desligado', 'o relatório de diagnóstico está desligado (Definições → Funcionalidades)');
      const signature = await getSignature(ctx).catch(() => null);
      const email = freeAuditEmail({ name, company, host, sender: signature?.full_name ?? null });
      await sendLeadEmail(ctx, leadId, LeadEmailSendSchema.parse({ to, subject: email.subject, body: email.body, attach_diagnosis: true, template: EMAIL_TEMPLATE }));
      sent = true;
    } catch (error) {
      problem = error instanceof ApiError ? (error.detail ?? error.title) : error instanceof Error ? error.message : 'erro ao enviar';
    }
  }
  const { data: lead } = await createSupabaseAdminClient().from('leads').select('id, number, company_name').eq('id', leadId).maybeSingle();
  await alertUser(ctx.workspaceId, ctx.user.id, {
    kind: 'site_form',
    leadId,
    title: sent ? `🔎 Análise grátis enviada: ${company}` : `🔎 Análise grátis pedida: ${company}`,
    body: sent ? `${host} — o PDF seguiu para ${to}. Liga hoje: é um lead quente.` : `${host} — ${problem}. Envia tu a análise a ${to} (ficha → Diagnóstico).`,
    url: lead ? leadPath(lead as { id: string; number: number; company_name: string }) : '/leads',
    tag: `free-audit-${leadId}`,
  }).catch(() => undefined);
}

/**
 * O resultado para mostrar logo no ecrã. `request` é o que o envio devolveu (assinado:
 * ninguém consegue ver o resultado de outra pessoa).
 */
export async function freeAuditStatus(token: string, request: string): Promise<FreeAuditStatus | null> {
  const ws = await workspaceFor(token);
  const value = verifySigned(request, REQUEST_PURPOSE);
  if (!ws || !value) return null;
  const [wsId, leadId, startedAt] = value.split('.');
  if (wsId !== ws.id || !leadId || !startedAt) return null;
  const { data } = await createSupabaseAdminClient()
    .from('site_audits')
    .select('status, pagespeed_mobile, has_viewport, zoom_blocked, suggested_mobile, https, ssl_valid, issues')
    .eq('workspace_id', ws.id)
    .eq('lead_id', leadId)
    .gte('created_at', startedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.status === 'done') return { state: 'done', summary: freeAuditSummary(data as unknown as SiteAudit) };
  // Sem análise ao fim de 3 minutos (site em baixo, erro): o PDF ou o aviso seguem por email.
  if (data?.status === 'error' || Date.now() - Date.parse(startedAt) > 3 * 60_000) return { state: 'failed', summary: null };
  return { state: 'pending', summary: null };
}

/** "O site abre?" antes de enviar (só endereços públicos; limitado por visitante). */
export async function checkFreeAuditSite(token: string, url: string, meta: { ip: string | null }): Promise<{ ok: boolean; message: string | null } | null> {
  const ws = await workspaceFor(token);
  if (!ws) return null;
  if (rateLimited(`check:${token}:${meta.ip ?? '?'}`, 20, 10 * 60_000)) return { ok: true, message: null };
  const parsed = FreeAuditSubmitSchema.shape.website.safeParse(url);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Endereço inválido.' };
  try {
    // Um site que responde (mesmo com 502/503) existe e está ligado: muitos alojamentos respondem com
    // erro a servidores (como o da plataforma) e abrem normalmente para as pessoas. Avisar aí afastava
    // visitantes com sites que funcionam; o aviso fica para quando o site não responde de todo.
    await safeGet(parsed.data, { timeoutMs: 7000, maxBytes: 64_000 });
    return { ok: true, message: null };
  } catch (error) {
    const blocked = error instanceof AuditRequestError && error.code === 'blocked';
    return { ok: false, message: blocked ? 'Endereço inválido (ex.: www.o-meu-negocio.pt).' : 'Este site não está a responder. Confirme o endereço (pode enviar na mesma).' };
  }
}

// O PDF de exemplo muda pouco: guarda-se 1 hora por conta.
const exampleCache = new Map<string, { at: number; pdf: Buffer }>();

/** O relatório de exemplo, com dados fictícios e a faixa "EXEMPLO". */
export async function freeAuditExamplePdf(token: string): Promise<Buffer | null> {
  const ws = await workspaceFor(token);
  if (!ws) return null;
  const cached = exampleCache.get(ws.id);
  if (cached && Date.now() - cached.at < 60 * 60_000) return cached.pdf;
  const ctx = await systemContext(ws.id, null);
  if (!ctx) return null;
  const [signature, services] = await Promise.all([getSignature(ctx), loadServiceCatalog(ctx)]);
  const now = new Date().toISOString();
  const audit: SiteAudit = {
    id: '00000000-0000-4000-8000-000000000000',
    lead_id: '00000000-0000-4000-8000-000000000001',
    url: 'https://www.padaria-exemplo.pt',
    final_url: 'https://www.padaria-exemplo.pt/',
    status: 'done',
    http_status: 200,
    response_ms: 2400,
    https: false,
    ssl_valid: null,
    ssl_issuer: null,
    ssl_expires_at: null,
    ssl_error: null,
    has_viewport: true,
    zoom_blocked: true,
    pagespeed_mobile: 38,
    metrics: {
      lcp_ms: 6200,
      cls: 0.21,
      geo: { structured_types: [], business_schema: false, faq: false, word_count: 140, phone: true, address: false, maps_link: false, ai_bots_blocked: [] },
    },
    title: 'Padaria Exemplo',
    meta_description: null,
    cms: 'WordPress',
    copyright_year: 2019,
    issues: [
      { code: 'no_https', severity: 'high', message: 'Não usa HTTPS — o browser mostra «Não seguro».', short: 'Sem HTTPS' },
      { code: 'pagespeed_low', severity: 'high', message: 'PageSpeed mobile baixo: 38/100.', short: 'PageSpeed 38' },
      { code: 'slow_lcp', severity: 'medium', message: 'Demora 6,2 s a mostrar o conteúdo principal (LCP).', short: 'Carrega em 6,2 s' },
      { code: 'zoom_blocked', severity: 'medium', message: 'Não deixa ampliar no telemóvel (zoom bloqueado).', short: 'Zoom bloqueado' },
      { code: 'no_meta_description', severity: 'medium', message: 'Sem meta descrição — o Google escolhe um texto qualquer.', short: 'Sem meta descrição' },
    ],
    suggested_problems: null,
    suggested_mobile: 'parcial',
    error: null,
    screenshots: [],
    created_at: now,
  };
  const pdf = await renderDiagnosisPdf({
    example: true,
    audit,
    lead: { company_name: 'Padaria Exemplo', contact_name: null, city: 'Lisboa', approach_angle: null, services: [] },
    services,
    signature,
    visibility: { summary: 'Quando se pergunta às IAs por uma padaria em Lisboa, a Padaria Exemplo não aparece; aparecem 3 concorrentes.', assistant: 'ChatGPT', mentioned: 0, total: 3, competitors: ['Concorrente A', 'Concorrente B', 'Concorrente C'], date: now.slice(0, 10) },
  });
  exampleCache.set(ws.id, { at: Date.now(), pdf });
  return pdf;
}

export interface FreeAuditStats {
  month: number;
  total: number;
  replied: number;
  clients: number;
  sources: { key: string; count: number }[];
}

/** Os números do cartão: pedidos (mês e total), quantos responderam e quantos são clientes. */
export async function freeAuditStats(ctx: ApiContext): Promise<FreeAuditStats> {
  const { data, error } = await ctx.supabase
    .from('lead_activities')
    .select('lead_id, created_at, payload')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'note')
    .eq('payload->>free_audit', 'true')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw fromPostgrest(error);
  const all = (data ?? []) as { lead_id: string; created_at: string; payload: { source_key?: string } | null }[];
  const ids = [...new Set(all.map((r) => r.lead_id))].slice(0, 1000);
  const [{ data: leads }, { data: replies }] = ids.length
    ? await Promise.all([
        ctx.supabase.from('leads').select('id, status').in('id', ids),
        ctx.supabase.from('lead_activities').select('lead_id, created_at').eq('workspace_id', ctx.workspaceId).eq('type', 'email_received').in('lead_id', ids),
      ])
    : [{ data: [] }, { data: [] }];
  // Só os pedidos cujo lead ainda existe (os apagados vão para a reciclagem e saem da conta).
  const alive = new Set((leads ?? []).map((l) => l.id as string));
  const rows = all.filter((r) => alive.has(r.lead_id));
  const monthStart = `${todayIso().slice(0, 7)}-01`;
  const first = new Map<string, string>();
  const sources = new Map<string, number>();
  for (const r of rows) {
    first.set(r.lead_id, r.created_at);
    const key = r.payload?.source_key ?? 'direto';
    sources.set(key, (sources.get(key) ?? 0) + 1);
  }
  const clients = (leads ?? []).filter((l) => l.status === 'cliente').length;
  const answered = new Set((replies ?? []).filter((r) => r.created_at >= (first.get(r.lead_id as string) ?? '')).map((r) => r.lead_id as string));
  // Também conta quem avançou (reunião, proposta, cliente) mesmo sem email.
  for (const l of leads ?? []) if (['reuniao', 'proposta_enviada', 'cliente'].includes(l.status as string)) answered.add(l.id as string);
  const replied = answered.size;
  return {
    month: rows.filter((r) => r.created_at >= monthStart).length,
    total: rows.length,
    replied,
    clients,
    sources: [...sources.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

/**
 * Cron diário: quem recebeu o PDF há N dias e não respondeu recebe um follow-up curto, na
 * mesma conversa (uma só vez). Só leads ainda em "Respondeu" (quem avançou não recebe).
 */
export async function runFreeAuditFollowUps(): Promise<{ sent: number; skipped: number }> {
  const admin = createSupabaseAdminClient();
  const { data: workspaces } = await admin.from('workspaces').select('id, settings').not('settings->free_audit->>token', 'is', null);
  let sent = 0;
  let skipped = 0;
  for (const w of workspaces ?? []) {
    const fa = ((w.settings as { free_audit?: Partial<FreeAuditSettings> } | null)?.free_audit ?? {}) as Partial<FreeAuditSettings>;
    const days = fa.follow_up_days === undefined ? 3 : fa.follow_up_days;
    if (!days) continue;
    const until = new Date(Date.now() - days * 86_400_000).toISOString();
    const since = new Date(Date.now() - (days + 7) * 86_400_000).toISOString();
    const { data: emails } = await admin
      .from('lead_activities')
      .select('lead_id, created_at, body, payload')
      .eq('workspace_id', w.id)
      .eq('type', 'email_sent')
      .eq('payload->>template', EMAIL_TEMPLATE)
      .gte('created_at', since)
      .lte('created_at', until)
      .limit(50);
    if (!emails?.length) continue;
    const ctx = await systemContext(w.id as string, null);
    if (!ctx) continue;
    for (const e of emails) {
      const leadId = e.lead_id as string;
      const [{ data: later }, { data: lead }] = await Promise.all([
        admin
          .from('lead_activities')
          .select('type, payload')
          .eq('lead_id', leadId)
          .gt('created_at', e.created_at as string)
          .in('type', ['email_received', 'email_sent', 'email_bounced']),
        admin.from('leads').select('id, status, email, contact_name, website').eq('id', leadId).maybeSingle(),
      ]);
      const answered = (later ?? []).some((a) => a.type !== 'email_sent' || (a.payload as { template?: string } | null)?.template === FOLLOW_UP_TEMPLATE);
      if (answered || !lead || lead.status !== 'respondeu' || !lead.email) {
        skipped += 1;
        continue;
      }
      const host = (() => {
        try {
          return new URL(String(lead.website)).hostname.replace(/^www\./, '');
        } catch {
          return 'o seu site';
        }
      })();
      const payload = (e.payload ?? {}) as { message_id?: string | null };
      try {
        await sendLeadEmail(
          ctx,
          leadId,
          LeadEmailSendSchema.parse({
            to: lead.email,
            subject: replySubject(String(e.body ?? `A análise do site ${host}`)),
            body: freeAuditFollowUpEmail({ name: (lead.contact_name as string | null) ?? null, host }).body,
            template: FOLLOW_UP_TEMPLATE,
            ...(payload.message_id ? { in_reply_to: payload.message_id } : {}),
          }),
        );
        sent += 1;
      } catch (error) {
        skipped += 1;
        console.error('[análise grátis] follow-up', error instanceof Error ? error.message : error);
      }
    }
  }
  return { sent, skipped };
}

// -----------------------------------------------------------------------------
// Plugin de WordPress: os sites onde está instalado (e a versão)
// -----------------------------------------------------------------------------
/** O plugin pediu a configuração: guarda o site e a versão (para avisar quando está desatualizado). */
export async function recordPluginCaller(token: string, caller: { site: string; version: string | null }): Promise<void> {
  const ws = await workspaceFor(token);
  if (!ws) return;
  await createSupabaseAdminClient()
    .from('free_audit_plugin_sites')
    .upsert({ workspace_id: ws.id, site: caller.site, version: caller.version, seen_at: new Date().toISOString() }, { onConflict: 'workspace_id,site' })
    .then(undefined, () => undefined);
}

/** Os sites com o plugin (os vistos nos últimos 90 dias), com a versão atual para comparar. */
export async function listPluginSites(ctx: ApiContext): Promise<FreeAuditPluginSites> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await ctx.supabase
    .from('free_audit_plugin_sites')
    .select('site, version, seen_at')
    .eq('workspace_id', ctx.workspaceId)
    .gte('seen_at', since)
    .order('seen_at', { ascending: false });
  // Sem a tabela (migração por aplicar): sem lista.
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return { latest: WP_PLUGIN_VERSION, sites: [] };
  if (error) throw fromPostgrest(error);
  return {
    latest: WP_PLUGIN_VERSION,
    sites: ((data ?? []) as { site: string; version: string | null; seen_at: string }[]).map((r) => ({ ...r, outdated: isOlderVersion(r.version, WP_PLUGIN_VERSION) })),
  };
}


// Vistas: no máximo 30 por endereço e hora (cada pessoa conta uma vez por dia, no browser).
const viewHits = new Map<string, number[]>();

/** +1 pessoa viu o formulário (plugin ou página /analise) no site de `page`. */
export async function countFreeAuditView(token: string, page: unknown, ip: string | null): Promise<boolean> {
  const site = freeAuditViewSite(typeof page === 'string' ? page.slice(0, 500) : null);
  if (!site) return false;
  const key = `${ip ?? '?'}|${site}`;
  const now = Date.now();
  const recent = (viewHits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  viewHits.set(key, recent);
  if (viewHits.size > 20_000) viewHits.clear();
  if (recent.length > 30) return false;
  const ws = await workspaceFor(token);
  if (!ws) return false;
  const { error } = await createSupabaseAdminClient().rpc('vnd_free_audit_count_view', { p_workspace_id: ws.id, p_site: site, p_day: todayIso() });
  // Antes do "npx supabase db push" a função não existe: não conta, sem erro para o visitante.
  if (error && !['PGRST202', '42883'].includes(error.code ?? '')) console.warn('[análise grátis] vista', error.message);
  return !error;
}

/** Por site, nos últimos `days` dias: quantas pessoas viram o formulário e quantos pedidos chegaram. */
export async function freeAuditFormStats(ctx: ApiContext, days = 30): Promise<FreeAuditFormStats> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [views, requests] = await Promise.all([
    ctx.supabase.from('free_audit_views').select('site, views').eq('workspace_id', ctx.workspaceId).gte('day', todayIso(since)).limit(5000),
    ctx.supabase
      .from('lead_activities')
      .select('payload')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'note')
      .eq('payload->>free_audit', 'true')
      .gte('created_at', since.toISOString())
      .limit(5000),
  ]);
  if (views.error && !['42P01', 'PGRST205'].includes(views.error.code ?? '')) throw fromPostgrest(views.error);
  if (requests.error) throw fromPostgrest(requests.error);
  const bySite = new Map<string, { views: number; requests: number }>();
  const at = (site: string) => bySite.get(site) ?? (bySite.set(site, { views: 0, requests: 0 }), bySite.get(site)!);
  for (const v of (views.data ?? []) as { site: string; views: number }[]) at(v.site).views += v.views;
  for (const r of (requests.data ?? []) as { payload: { source?: { page?: string } | null } | null }[]) {
    at(freeAuditViewSite(r.payload?.source?.page) ?? 'sem site').requests += 1;
  }
  return {
    days,
    sites: [...bySite.entries()]
      .map(([site, n]) => ({ site, views: n.views, requests: n.requests, rate: n.views ? Math.min(1, n.requests / n.views) : null }))
      .sort((a, b) => b.views - a.views || b.requests - a.requests),
  };
}
