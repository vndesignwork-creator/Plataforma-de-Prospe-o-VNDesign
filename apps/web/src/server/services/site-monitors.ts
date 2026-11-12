/**
 * Vigiar os sites dos clientes (Definições → Funcionalidades: "Vigiar os sites dos clientes").
 * O cron de 5 em 5 minutos verifica cada site de hora a hora (uma falha volta a ser vista
 * 5 minutos depois; 2 seguidas = em baixo), lê o certificado SSL e, de 7 em 7 dias (todos
 * os dias no último mês), consulta a data do domínio (RDAP público). Avisa e cria uma tarefa
 * uma vez por problema. Se o cliente tiver a renovação do domínio em "Renovações e avenças",
 * o aviso do domínio fica a cargo das renovações (sem repetir).
 */
import {
  DOMAIN_WARN_DAYS,
  DOWN_AFTER_FAILS,
  FALSE_ALARM_DAYS,
  downMuted,
  PROSPECT_CHECK_MINUTES,
  PROSPECT_WATCH_COUNT,
  SSL_WARN_DAYS,
  WorkspaceSettingsSchema,
  daysBetween,
  domainLookupDue,
  formatDate,
  leadPath,
  nextCheckAt,
  rdapBaseFor,
  rdapExpiry,
  registrableDomain,
  siteOpportunity,
  todayIso,
  type Opportunity,
  type SiteMonitor,
  type SiteMonitorListItem,
  type SiteMonitorUpdate,
  isSocialOrDirectoryUrl,
} from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPageSpeedEnabled, runPageSpeed } from '../audit/pagespeed';
import { BROWSER_USER_AGENT, safeGet } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead } from './leads';
import { saveAlert } from './push';

const SELECT =
  'id, lead_id, url, active, checked_at, next_check_at, is_up, status_code, response_ms, error, fail_count, down_since, ssl_expires_at, ssl_error, domain_expires_on, domain_source, domain_checked_at, down_muted_until, created_at, updated_at';
const NOT_FOUND = 'Vigilância do site não encontrada';
const missingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';
const notReady = () => new ApiError(503, 'Ainda não disponível', 'A base de dados ainda não foi atualizada (npx supabase db push).');

type Row = SiteMonitor & { workspace_id?: string; alerted?: Record<string, string> };

/** Data da renovação do domínio (Renovações e avenças), por lead. */
async function domainRenewals(client: SupabaseClient, workspaceId: string, leadIds: string[]): Promise<Map<string, string>> {
  if (!leadIds.length) return new Map();
  const { data } = await client
    .from('client_renewals')
    .select('lead_id, next_due_on')
    .eq('workspace_id', workspaceId)
    .eq('kind', 'domain')
    .eq('active', true)
    .in('lead_id', leadIds);
  const map = new Map<string, string>();
  for (const r of (data ?? []) as { lead_id: string; next_due_on: string }[]) {
    if (!map.has(r.lead_id) || r.next_due_on < map.get(r.lead_id)!) map.set(r.lead_id, r.next_due_on);
  }
  return map;
}

export async function listSiteMonitors(ctx: ApiContext): Promise<SiteMonitorListItem[]> {
  const { data, error } = await ctx.supabase
    .from('site_monitors')
    .select(`${SELECT}, lead:leads!inner(id, number, company_name, archived_at, anonymized_at)`)
    .eq('workspace_id', ctx.workspaceId)
    .is('lead.anonymized_at', null)
    .order('created_at');
  if (missingTable(error)) return [];
  if (error) throw fromPostgrest(error);
  type R = SiteMonitor & { lead: { id: string; number: number; company_name: string } };
  const rows = (data ?? []) as unknown as R[];
  const renewals = await domainRenewals(
    ctx.supabase,
    ctx.workspaceId,
    rows.map((r) => r.lead_id),
  );
  return rows.map(({ lead, ...m }) => ({
    ...m,
    lead: { id: lead.id, number: lead.number, company_name: lead.company_name },
    domain_renewal_on: renewals.get(m.lead_id) ?? null,
  }));
}

/** O site vigiado do lead (null = não está a ser vigiado). */
export async function getSiteMonitor(ctx: ApiContext, leadId: string): Promise<(SiteMonitor & { domain_renewal_on: string | null }) | null> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase.from('site_monitors').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId).maybeSingle();
  if (missingTable(error)) return null;
  if (error) throw fromPostgrest(error);
  if (!data) return null;
  const renewals = await domainRenewals(ctx.supabase, ctx.workspaceId, [leadId]);
  return { ...(data as unknown as SiteMonitor), domain_renewal_on: renewals.get(leadId) ?? null };
}

/** Começar a vigiar (o endereço indicado ou o site do lead) e verificar já. */
export async function createSiteMonitor(ctx: ApiContext, leadId: string, input: { url?: string }): Promise<SiteMonitor> {
  const lead = await getLead(ctx, leadId);
  const url = input.url ?? (lead.website ? (/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`) : null);
  if (!url) throw new ApiError(422, 'Sem endereço', 'Este cliente não tem site na ficha. Escreve o endereço a vigiar.');
  // Uma página do Facebook ou do Instagram não é um site: responde com erros e não tem domínio próprio.
  if (isSocialOrDirectoryUrl(url)) throw new ApiError(422, 'Não é um site', 'Esse endereço é de uma rede social ou de um diretório, não do site do cliente. Escreve o endereço do site.');
  const result = await ctx.supabase
    .from('site_monitors')
    .insert({ workspace_id: ctx.workspaceId, lead_id: leadId, url })
    .select(SELECT)
    .single();
  if (missingTable(result.error)) throw notReady();
  if (result.error?.code === '23505') throw new ApiError(409, 'Já está a ser vigiado', 'O site deste cliente já está a ser vigiado.');
  const monitor = unwrap(result) as unknown as SiteMonitor;
  return checkAndSave(ctx.supabase, monitor, { alerts: false });
}

export async function updateSiteMonitor(ctx: ApiContext, id: string, patch: SiteMonitorUpdate): Promise<SiteMonitor> {
  const update: Record<string, unknown> = {};
  if (patch.active !== undefined) {
    update.active = patch.active;
    if (patch.active) update.next_check_at = new Date().toISOString();
  }
  if (patch.domain_expires_on !== undefined) {
    // Escrito à mão (fica assim); vazio = volta a consultar.
    update.domain_expires_on = patch.domain_expires_on;
    update.domain_source = patch.domain_expires_on ? 'manual' : null;
    update.domain_checked_at = null;
  }
  if (patch.false_alarm !== undefined) {
    // "Falso alarme": o site está no ar. Tira o "em baixo" e silencia as falhas durante uns dias.
    Object.assign(
      update,
      patch.false_alarm
        ? {
            is_up: true,
            fail_count: 0,
            down_since: null,
            error: null,
            down_muted_until: new Date(Date.now() + FALSE_ALARM_DAYS * 86_400_000).toISOString(),
          }
        : { down_muted_until: null, next_check_at: new Date().toISOString() },
    );
  }
  if (patch.url) {
    // Outro endereço: começa do zero.
    Object.assign(update, {
      url: patch.url,
      is_up: null,
      status_code: null,
      response_ms: null,
      error: null,
      fail_count: 0,
      down_since: null,
      ssl_expires_at: null,
      ssl_error: null,
      next_check_at: new Date().toISOString(),
      down_muted_until: null,
      alerted: {},
      ...(patch.domain_expires_on === undefined ? { domain_expires_on: null, domain_source: null, domain_checked_at: null } : {}),
    });
  }
  const result = await ctx.supabase.from('site_monitors').update(update).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).maybeSingle();
  const monitor = unwrap(result, NOT_FOUND) as unknown as SiteMonitor;
  if (patch.false_alarm) await removeDownTask(ctx.supabase, monitor.lead_id);
  return patch.url ? checkAndSave(ctx.supabase, monitor, { alerts: false }) : monitor;
}

export async function deleteSiteMonitor(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('site_monitors').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
}

/** "Verificar agora". */
export async function checkSiteMonitorNow(ctx: ApiContext, id: string): Promise<SiteMonitor> {
  const result = await ctx.supabase.from('site_monitors').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle();
  const monitor = unwrap(result, NOT_FOUND) as unknown as SiteMonitor;
  return checkAndSave(ctx.supabase, monitor, { alerts: false, forceDomain: monitor.domain_source !== 'manual' });
}

// -----------------------------------------------------------------------------
// Verificação
// -----------------------------------------------------------------------------
export interface SiteCheck {
  ok: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
  ssl_expires_at: string | null;
  ssl_error: string | null;
}

/** Abre o site (como um browser no telemóvel): no ar = respondeu com 2xx/3xx… ou 401/403 (está lá, só pede acesso). */
async function checkOnce(url: string, userAgent?: string): Promise<SiteCheck> {
  try {
    const res = await safeGet(url, { timeoutMs: 15_000, maxBytes: 300_000, userAgent });
    const ok = res.status > 0 && (res.status < 400 || res.status === 401 || res.status === 403);
    return {
      ok,
      status_code: res.status,
      response_ms: res.response_ms,
      error: ok ? null : `O site respondeu com o erro ${res.status}.`,
      ssl_expires_at: res.certificate?.expires_at ?? null,
      ssl_error: res.certificate?.error ?? null,
    };
  } catch (error) {
    return { ok: false, status_code: null, response_ms: null, error: error instanceof Error ? error.message.slice(0, 300) : 'Não foi possível abrir o site.', ssl_expires_at: null, ssl_error: null };
  }
}

/** Com "www." ou sem ele (o outro endereço do mesmo site). */
function otherWwwVariant(url: string): string | null {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Abre o site (como um browser no telemóvel). Antes de o dar como em baixo, tenta de
 * novo como um browser normal (há alojamentos que respondem com 502/429 a robôs) e,
 * se ainda falhar, o mesmo site com/sem "www.". Só fica em baixo se tudo falhar.
 */
export async function checkSite(url: string): Promise<SiteCheck> {
  const first = await checkOnce(url);
  if (first.ok) return first;
  // Um 404 é o site a responder (a página é que não existe): não vale a pena insistir.
  if (first.status_code !== null && first.status_code < 500 && first.status_code !== 429) return first;
  await new Promise((r) => setTimeout(r, 1500));
  const asBrowser = await checkOnce(url, BROWSER_USER_AGENT);
  if (asBrowser.ok) return asBrowser;
  const variant = otherWwwVariant(url);
  if (variant) {
    const other = await checkOnce(variant, BROWSER_USER_AGENT);
    if (other.ok) return other;
  }
  // Respondeu com erro só a nós? Segunda opinião: se o Google abre o site, ele está no ar
  // (há alojamentos que bloqueiam o servidor da plataforma com 502/503 em poucos milissegundos).
  if (first.status_code !== null && (await googleOpensSite(url))) {
    return { ...first, ok: true, error: null };
  }
  return first;
}

const googleCache = new Map<string, { at: number; opens: boolean }>();
/** O Google (PageSpeed) consegue abrir o site? Guardado 6 h se sim, 30 min se não (poupa pedidos). */
export async function googleOpensSite(url: string): Promise<boolean> {
  if (!isPageSpeedEnabled()) return false;
  const cached = googleCache.get(url);
  if (cached && Date.now() - cached.at < (cached.opens ? 6 * 3_600_000 : 30 * 60_000)) return cached.opens;
  const outcome = await runPageSpeed(url, 50_000);
  const opens = outcome.ok;
  googleCache.set(url, { at: Date.now(), opens });
  return opens;
}

let bootstrapCache: { at: number; body: unknown } | null = null;
/** Data de expiração do domínio pela consulta pública RDAP (null se não for possível). */
export async function lookupDomainExpiry(domain: string): Promise<string | null> {
  const fetchJson = async (url: string) => {
    const res = await fetch(url, { headers: { Accept: 'application/rdap+json, application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'follow' });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  };
  try {
    if (!bootstrapCache || Date.now() - bootstrapCache.at > 24 * 3_600_000) {
      bootstrapCache = { at: Date.now(), body: await fetchJson('https://data.iana.org/rdap/dns.json') };
    }
    const base = rdapBaseFor(domain, bootstrapCache.body);
    // Sem servidor na lista da IANA (ex.: alguns domínios de país): o rdap.org reencaminha quando sabe.
    const body = await fetchJson(base ? `${base}domain/${encodeURIComponent(domain)}` : `https://rdap.org/domain/${encodeURIComponent(domain)}`);
    return rdapExpiry(body);
  } catch {
    return null;
  }
}

/** Tira a tarefa automática "Contactar…: o site está em baixo (oportunidade)" ainda por fazer. */
async function removeDownTask(client: SupabaseClient, leadId: string): Promise<void> {
  await client
    .from('lead_tasks')
    .delete()
    .eq('lead_id', leadId)
    .is('created_by', null)
    .is('done_at', null)
    .like('title', 'Contactar %: o site está em baixo (oportunidade)')
    .then(undefined, () => undefined);
}

/** Verifica um site, guarda o resultado e (no cron) avisa dos problemas novos. */
async function checkAndSave(
  client: SupabaseClient,
  m: Row,
  options: { alerts: boolean; forceDomain?: boolean; now?: Date; workspaceId?: string; prospect?: boolean },
): Promise<SiteMonitor> {
  const now = options.now ?? new Date();
  const today = todayIso(now);
  const check = await checkSite(m.url);
  const failCount = check.ok ? 0 : m.fail_count + 1;
  // Falso alarme marcado há pouco: as falhas ficam registadas, mas o site não passa a "em baixo".
  const muted = downMuted(m, now);
  const down = !check.ok && failCount >= DOWN_AFTER_FAILS && !muted;
  const update: Record<string, unknown> = {
    checked_at: now.toISOString(),
    // Leads (não clientes): de 6 em 6 horas chega.
    next_check_at: nextCheckAt(now, !check.ok, options.prospect ? PROSPECT_CHECK_MINUTES : 60),
    is_up: check.ok ? true : down ? false : muted ? true : m.is_up,
    status_code: check.status_code,
    response_ms: check.response_ms,
    error: check.error,
    fail_count: failCount,
    down_since: check.ok || muted ? null : down ? (m.down_since ?? m.checked_at ?? now.toISOString()) : m.down_since,
    // O certificado só se lê quando o site responde (senão fica o último conhecido).
    ...(check.status_code !== null ? { ssl_expires_at: check.ssl_expires_at, ssl_error: check.ssl_error } : {}),
  };
  // O domínio só interessa nos clientes (o dos leads é problema deles).
  if (!options.prospect && (options.forceDomain || domainLookupDue(m, today))) {
    const domain = registrableDomain(m.url);
    const expiry = domain ? await lookupDomainExpiry(domain) : null;
    update.domain_checked_at = now.toISOString();
    if (expiry) Object.assign(update, { domain_expires_on: expiry, domain_source: 'rdap' });
  }
  const { data, error } = await client.from('site_monitors').update(update).eq('id', m.id).select(SELECT).single();
  if (error) throw fromPostgrest(error);
  const saved = data as unknown as SiteMonitor;
  // O site voltou (ou afinal estava no ar): a tarefa automática "Contactar…: o site está em baixo" deixa de fazer sentido.
  if (check.ok && m.down_since) await removeDownTask(client, m.lead_id);
  if (options.alerts && options.workspaceId) {
    const alert = options.prospect
      ? alertOpportunity(client, options.workspaceId, { ...saved, alerted: m.alerted ?? {} }, today)
      : alertProblems(client, options.workspaceId, { ...saved, alerted: m.alerted ?? {} }, { wasDown: !!m.down_since, today });
    await alert.catch((e) => console.warn('[sites] aviso', e instanceof Error ? e.message : e));
  }
  return saved;
}

/**
 * Lead (ainda não cliente) com o site com um problema: aviso "Leads quentes" e uma tarefa
 * "Contactar…" (uma vez por problema; lento, no máximo uma vez por mês).
 */
async function alertOpportunity(client: SupabaseClient, workspaceId: string, m: Row, today: string) {
  const opportunity = siteOpportunity(m, today);
  if (!opportunity) return;
  const alerted = { ...(m.alerted ?? {}) };
  const key = opportunity.kind === 'down' ? (m.down_since ?? today) : opportunity.kind === 'slow' ? today.slice(0, 7) : (m.ssl_expires_at?.slice(0, 10) ?? today);
  if (alerted[`opp_${opportunity.kind}`] === key) return;
  const { data: lead } = await client
    .from('leads')
    .select('id, number, company_name, status, assigned_to, created_by, anonymized_at, archived_at')
    .eq('workspace_id', workspaceId)
    .eq('id', m.lead_id)
    .maybeSingle();
  if (!lead || lead.anonymized_at || lead.archived_at || lead.status === 'cliente' || lead.status === 'sem_interesse') return;
  alerted[`opp_${opportunity.kind}`] = key;
  await client.from('site_monitors').update({ alerted }).eq('id', m.id);
  const userId = ((lead.assigned_to as string | null) ?? (lead.created_by as string | null) ?? (await workspaceOwner(client, workspaceId))) as string | null;
  const name = lead.company_name as string;
  const url = `${leadPath(lead as { id: string; number: number; company_name: string })}#contacto`;
  if (userId) {
    await saveAlert(workspaceId, userId, {
      kind: 'email_open',
      leadId: m.lead_id,
      title: `🎯 Oportunidade: ${name}`,
      body: `${opportunity.label} — bom momento para contactar (a mensagem está pronta na ficha).`,
      url,
      tag: `opp-${m.id}-${opportunity.kind}-${key}`,
    }).catch(() => undefined);
  }
  const title = `Contactar ${name}: ${opportunity.label.charAt(0).toLowerCase()}${opportunity.label.slice(1)} (oportunidade)`.slice(0, 300);
  const { data: open } = await client.from('lead_tasks').select('id').eq('workspace_id', workspaceId).eq('lead_id', m.lead_id).eq('title', title).is('done_at', null).limit(1);
  if (!open?.length) {
    await client.from('lead_tasks').insert({ workspace_id: workspaceId, lead_id: m.lead_id, title, due_on: today, assigned_to: userId, created_by: null, position: -1 });
  }
}

/**
 * Os leads quentes vigiados sozinhos: os PROSPECT_WATCH_COUNT de maior pontuação com site
 * (em pipeline). Junta os que entraram e tira os que saíram (só os juntados sozinhos;
 * os que alguém juntou à mão e os clientes ficam).
 */
export async function syncProspectWatch(options: { dryRun?: boolean } = {}): Promise<{ workspaces: number; added: number; removed: number; skipped?: string }> {
  const admin = createSupabaseAdminClient();
  const probe = await admin.from('site_monitors').select('id').limit(0);
  if (missingTable(probe.error)) return { workspaces: 0, added: 0, removed: 0, skipped: 'sem a tabela' };
  const { data: workspaces } = await admin.from('workspaces').select('id, settings');
  const on = ((workspaces ?? []) as { id: string; settings: unknown }[]).filter((w) => {
    const f = WorkspaceSettingsSchema.parse(w.settings ?? {}).features;
    return f.prospect_watch && f.site_monitoring;
  });
  let added = 0;
  let removed = 0;
  for (const w of on) {
    const { data: hot } = await admin
      .from('leads')
      .select('id, website')
      .eq('workspace_id', w.id)
      .is('archived_at', null)
      .is('anonymized_at', null)
      .not('status', 'in', '(cliente,sem_interesse,em_pausa)')
      .not('website', 'is', null)
      .gt('score', 0)
      .order('score', { ascending: false })
      .limit(PROSPECT_WATCH_COUNT);
    const wanted = ((hot ?? []) as { id: string; website: string }[]).filter(
      (l) => /^(https?:\/\/)?[^\s/]+\.[^\s]+/i.test(l.website.trim()) && !isSocialOrDirectoryUrl(l.website),
    );
    const { data: existing } = await admin.from('site_monitors').select('id, lead_id, created_by, lead:leads!inner(status)').eq('workspace_id', w.id);
    type Ex = { id: string; lead_id: string; created_by: string | null; lead: { status: string } };
    const rows = (existing ?? []) as unknown as Ex[];
    const have = new Set(rows.map((r) => r.lead_id));
    const toAdd = wanted.filter((l) => !have.has(l.id));
    const wantedIds = new Set(wanted.map((l) => l.id));
    const toRemove = rows.filter((r) => !r.created_by && r.lead.status !== 'cliente' && !wantedIds.has(r.lead_id));
    if (options.dryRun) {
      added += toAdd.length;
      removed += toRemove.length;
      continue;
    }
    if (toAdd.length) {
      const { error } = await admin.from('site_monitors').insert(
        toAdd.map((l) => ({
          workspace_id: w.id,
          lead_id: l.id,
          url: /^https?:\/\//i.test(l.website.trim()) ? l.website.trim() : `https://${l.website.trim()}`,
          created_by: null,
          next_check_at: new Date().toISOString(),
        })),
      );
      if (error) console.warn('[sites] leads quentes', error.message);
      else added += toAdd.length;
    }
    if (toRemove.length) {
      await admin.from('site_monitors').delete().in(
        'id',
        toRemove.map((r) => r.id),
      );
      removed += toRemove.length;
    }
  }
  return { workspaces: on.length, added, removed };
}

/** Prospeção: as oportunidades (problema no site agora) dos leads da lista. */
export async function opportunitiesFor(ctx: ApiContext, leadIds: string[]): Promise<Map<string, Opportunity>> {
  const map = new Map<string, Opportunity>();
  if (!leadIds.length) return map;
  const { data, error } = await ctx.supabase.from('site_monitors').select(SELECT).eq('workspace_id', ctx.workspaceId).in('lead_id', leadIds);
  if (error) return map;
  const today = todayIso();
  for (const m of (data ?? []) as unknown as SiteMonitor[]) {
    const o = siteOpportunity(m, today);
    if (o) map.set(m.lead_id, o);
  }
  return map;
}

/** Avisos e tarefas (uma vez por problema): em baixo / voltou, SSL e domínio a expirar. */
async function alertProblems(client: SupabaseClient, workspaceId: string, m: Row, ctx: { wasDown: boolean; today: string }) {
  const alerted = { ...(m.alerted ?? {}) };
  const { data: lead } = await client
    .from('leads')
    .select('id, number, company_name, assigned_to, created_by, anonymized_at')
    .eq('workspace_id', workspaceId)
    .eq('id', m.lead_id)
    .maybeSingle();
  if (!lead || lead.anonymized_at) return;
  const owner = await workspaceOwner(client, workspaceId);
  const userId = ((lead.assigned_to as string | null) ?? (lead.created_by as string | null) ?? owner) as string | null;
  const name = lead.company_name as string;
  const url = `${leadPath(lead as { id: string; number: number; company_name: string })}#projeto`;
  const host = (() => {
    try {
      return new URL(m.url).hostname;
    } catch {
      return m.url;
    }
  })();
  const task = async (title: string, due: string) => {
    // Já há uma igual por fazer (ex.: o site foi abaixo outra vez): não cria outra.
    const { data: open } = await client.from('lead_tasks').select('id').eq('workspace_id', workspaceId).eq('lead_id', m.lead_id).eq('title', title.slice(0, 300)).is('done_at', null).limit(1);
    if (open?.length) return;
    const { error } = await client.from('lead_tasks').insert({ workspace_id: workspaceId, lead_id: m.lead_id, title: title.slice(0, 300), due_on: due, assigned_to: userId, created_by: null, position: -1 });
    if (error) console.warn('[sites] tarefa', error.message);
  };
  const alert = async (key: string, title: string, body: string) => {
    if (userId) await saveAlert(workspaceId, userId, { kind: 'client', leadId: m.lead_id, title, body, url, tag: `site-${m.id}-${key}` }).catch(() => undefined);
  };

  // Em baixo (2 falhas seguidas) e "voltou ao ar".
  if (m.down_since && alerted.down !== m.down_since) {
    alerted.down = m.down_since;
    await alert(`down-${m.down_since}`, `🔴 Site em baixo: ${name}`, `${host} — ${m.error ?? 'não responde'}`);
    await task(`Ver o site em baixo: ${host} (${name})`, ctx.today);
  } else if (!m.down_since && ctx.wasDown && alerted.down) {
    delete alerted.down;
    await alert(`up-${ctx.today}`, `🟢 Site de novo no ar: ${name}`, host);
  }
  // Certificado SSL a expirar (ou expirado).
  if (m.ssl_expires_at) {
    const day = m.ssl_expires_at.slice(0, 10);
    const left = daysBetween(ctx.today, day);
    if (left <= SSL_WARN_DAYS && alerted.ssl !== day) {
      alerted.ssl = day;
      await alert(`ssl-${day}`, `🔒 ${left < 0 ? 'Certificado SSL expirado' : 'Certificado SSL a expirar'}: ${name}`, `${host} — ${left < 0 ? 'expirou a' : 'expira a'} ${formatDate(day)}`);
      await task(`Renovar o certificado SSL de ${host} (${left < 0 ? 'expirou' : 'expira'} a ${formatDate(day)})`, left < 0 ? ctx.today : day);
    }
  }
  // Domínio a expirar — se não houver a renovação do domínio registada (essa já avisa).
  if (m.domain_expires_on) {
    const renewals = await domainRenewals(client, workspaceId, [m.lead_id]);
    const left = daysBetween(ctx.today, m.domain_expires_on);
    if (!renewals.has(m.lead_id) && left <= DOMAIN_WARN_DAYS && alerted.domain !== m.domain_expires_on) {
      alerted.domain = m.domain_expires_on;
      const domain = registrableDomain(m.url) ?? host;
      await alert(`domain-${m.domain_expires_on}`, `🌐 ${left < 0 ? 'Domínio expirado' : 'Domínio a expirar'}: ${name}`, `${domain} — ${left < 0 ? 'expirou a' : 'expira a'} ${formatDate(m.domain_expires_on)}`);
      await task(`Renovar o domínio ${domain} (${left < 0 ? 'expirou' : 'expira'} a ${formatDate(m.domain_expires_on)})`, left < 0 ? ctx.today : m.domain_expires_on);
    }
  }
  if (JSON.stringify(alerted) !== JSON.stringify(m.alerted ?? {})) await client.from('site_monitors').update({ alerted }).eq('id', m.id);
}

const owners = new Map<string, string | null>();
async function workspaceOwner(client: SupabaseClient, workspaceId: string): Promise<string | null> {
  if (owners.has(workspaceId)) return owners.get(workspaceId)!;
  const { data } = await client.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'owner').limit(1).maybeSingle();
  const id = (data?.user_id as string | undefined) ?? null;
  owners.set(workspaceId, id);
  return id;
}

/** Cron (5 em 5 minutos): os sites cuja verificação chegou à hora, nos workspaces com a funcionalidade ligada. */
export async function runSiteMonitors(options: { dryRun?: boolean; now?: Date; limit?: number } = {}): Promise<{ due: number; checked: number; skipped?: string }> {
  const admin = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const { data, error } = await admin
    .from('site_monitors')
    .select(`workspace_id, alerted, lead:leads!inner(status), ${SELECT}`)
    .eq('active', true)
    .lte('next_check_at', now.toISOString())
    .order('next_check_at')
    .limit(options.limit ?? 30);
  if (missingTable(error)) return { due: 0, checked: 0, skipped: 'sem a tabela' };
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as (Row & { workspace_id: string; lead: { status: string } })[];
  if (!rows.length) return { due: 0, checked: 0 };
  const workspaceIds = [...new Set(rows.map((r) => r.workspace_id))];
  const { data: workspaces } = await admin.from('workspaces').select('id, settings').in('id', workspaceIds);
  const features = new Map(((workspaces ?? []) as { id: string; settings: unknown }[]).map((w) => [w.id, WorkspaceSettingsSchema.parse(w.settings ?? {}).features]));
  // Clientes: "Vigiar os sites dos clientes"; leads: também "Avisar quando o site de um lead quente tem um problema".
  const todo = rows.filter((r) => {
    const f = features.get(r.workspace_id);
    return !!f?.site_monitoring && (r.lead.status === 'cliente' || f.prospect_watch);
  });
  if (options.dryRun) return { due: todo.length, checked: 0 };
  let checked = 0;
  // 5 de cada vez (cada site pode demorar até 15 s).
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (m) => {
        try {
          await checkAndSave(admin, m, { alerts: true, now, workspaceId: m.workspace_id, prospect: m.lead.status !== 'cliente' });
          checked++;
        } catch (e) {
          console.warn('[sites] verificação', m.url, e instanceof Error ? e.message : e);
        }
      }),
    );
  }
  return { due: todo.length, checked };
}
