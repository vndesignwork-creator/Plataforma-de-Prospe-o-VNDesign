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
  todayIso,
  type SiteMonitor,
  type SiteMonitorListItem,
  type SiteMonitorUpdate,
} from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { safeGet } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead } from './leads';
import { saveAlert } from './push';

const SELECT =
  'id, lead_id, url, active, checked_at, next_check_at, is_up, status_code, response_ms, error, fail_count, down_since, ssl_expires_at, ssl_error, domain_expires_on, domain_source, domain_checked_at, created_at, updated_at';
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
      alerted: {},
      ...(patch.domain_expires_on === undefined ? { domain_expires_on: null, domain_source: null, domain_checked_at: null } : {}),
    });
  }
  const result = await ctx.supabase.from('site_monitors').update(update).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).maybeSingle();
  const monitor = unwrap(result, NOT_FOUND) as unknown as SiteMonitor;
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
export async function checkSite(url: string): Promise<SiteCheck> {
  try {
    const res = await safeGet(url, { timeoutMs: 15_000, maxBytes: 300_000 });
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

/** Verifica um site, guarda o resultado e (no cron) avisa dos problemas novos. */
async function checkAndSave(
  client: SupabaseClient,
  m: Row,
  options: { alerts: boolean; forceDomain?: boolean; now?: Date; workspaceId?: string },
): Promise<SiteMonitor> {
  const now = options.now ?? new Date();
  const today = todayIso(now);
  const check = await checkSite(m.url);
  const failCount = check.ok ? 0 : m.fail_count + 1;
  const down = !check.ok && failCount >= DOWN_AFTER_FAILS;
  const update: Record<string, unknown> = {
    checked_at: now.toISOString(),
    next_check_at: nextCheckAt(now, !check.ok),
    is_up: check.ok ? true : down ? false : m.is_up,
    status_code: check.status_code,
    response_ms: check.response_ms,
    error: check.error,
    fail_count: failCount,
    down_since: check.ok ? null : down ? (m.down_since ?? m.checked_at ?? now.toISOString()) : m.down_since,
    // O certificado só se lê quando o site responde (senão fica o último conhecido).
    ...(check.status_code !== null ? { ssl_expires_at: check.ssl_expires_at, ssl_error: check.ssl_error } : {}),
  };
  if (options.forceDomain || domainLookupDue(m, today)) {
    const domain = registrableDomain(m.url);
    const expiry = domain ? await lookupDomainExpiry(domain) : null;
    update.domain_checked_at = now.toISOString();
    if (expiry) Object.assign(update, { domain_expires_on: expiry, domain_source: 'rdap' });
  }
  const { data, error } = await client.from('site_monitors').update(update).eq('id', m.id).select(SELECT).single();
  if (error) throw fromPostgrest(error);
  const saved = data as unknown as SiteMonitor;
  if (options.alerts && options.workspaceId) {
    await alertProblems(client, options.workspaceId, { ...saved, alerted: m.alerted ?? {} }, { wasDown: !!m.down_since, today }).catch((e) =>
      console.warn('[sites] aviso', e instanceof Error ? e.message : e),
    );
  }
  return saved;
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
    .select(`workspace_id, alerted, ${SELECT}`)
    .eq('active', true)
    .lte('next_check_at', now.toISOString())
    .order('next_check_at')
    .limit(options.limit ?? 30);
  if (missingTable(error)) return { due: 0, checked: 0, skipped: 'sem a tabela' };
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as (Row & { workspace_id: string })[];
  if (!rows.length) return { due: 0, checked: 0 };
  const workspaceIds = [...new Set(rows.map((r) => r.workspace_id))];
  const { data: workspaces } = await admin.from('workspaces').select('id, settings').in('id', workspaceIds);
  const enabled = new Set(
    ((workspaces ?? []) as { id: string; settings: unknown }[]).filter((w) => WorkspaceSettingsSchema.parse(w.settings ?? {}).features.site_monitoring).map((w) => w.id),
  );
  const todo = rows.filter((r) => enabled.has(r.workspace_id));
  if (options.dryRun) return { due: todo.length, checked: 0 };
  let checked = 0;
  // 5 de cada vez (cada site pode demorar até 15 s).
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (m) => {
        try {
          await checkAndSave(admin, m, { alerts: true, now, workspaceId: m.workspace_id });
          checked++;
        } catch (e) {
          console.warn('[sites] verificação', m.url, e instanceof Error ? e.message : e);
        }
      }),
    );
  }
  return { due: todo.length, checked };
}
