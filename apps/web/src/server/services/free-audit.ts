/**
 * "Analisar o meu site grátis" (/analise/<código>): o visitante escreve o site e o email,
 * entra como lead quente (canal "Formulário do site", "Ligar: pediu a análise…" para hoje),
 * o site é analisado em segundo plano e o diagnóstico em PDF segue por email (pelo email
 * de envio do dono). Se não for possível enviar, o dono é avisado para o enviar ele.
 */
import { randomBytes } from 'node:crypto';
import {
  FreeAuditSubmitSchema,
  LeadCreateSchema,
  LeadEmailSendSchema,
  freeAuditEmail,
  leadPath,
  normalizeEmail,
  todayIso,
  websiteKey,
  type FreeAuditSettings,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { createActivity } from './activities';
import { runLeadAudit } from './audits';
import { sendLeadEmail } from './lead-email';
import { createLead, updateLead } from './leads';
import { alertUser } from './push';
import { getSettings, getSignature } from './workspace';

const NEXT_ACTION = 'Ligar: pediu a análise grátis do site';

/** Ligar/desligar (ou trocar o código). Só o dono ou um administrador. */
export async function setFreeAudit(ctx: ApiContext, input: { enabled: boolean; rotate: boolean }): Promise<FreeAuditSettings> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem permissão', 'Só o dono ou um administrador pode mudar a análise grátis.');
  const current = await getSettings(ctx);
  const token = !input.enabled ? null : input.rotate || !current.free_audit.token ? randomBytes(18).toString('base64url') : current.free_audit.token;
  const next = { ...current, free_audit: { token } };
  const { error } = await ctx.supabase.from('workspaces').update({ settings: next }).eq('id', ctx.workspaceId);
  if (error) throw fromPostgrest(error);
  return next.free_audit;
}

const validToken = (t: string) => /^[A-Za-z0-9_-]{16,64}$/.test(t);

async function workspaceFor(token: string): Promise<string | null> {
  if (!validToken(token)) return null;
  const { data } = await createSupabaseAdminClient().from('workspaces').select('id').eq('settings->free_audit->>token', token).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Para a página pública: o nome de quem oferece a análise (da assinatura do dono). */
export async function freeAuditPage(token: string): Promise<{ company: string | null } | null> {
  const ws = await workspaceFor(token);
  if (!ws) return null;
  const ctx = await systemContext(ws, null);
  if (!ctx) return null;
  const signature = await getSignature(ctx).catch(() => null);
  return { company: signature?.company?.trim() || signature?.full_name?.trim() || null };
}

// Contra spam: 3 pedidos por 30 minutos por endereço.
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 30 * 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > 3;
}

export type FreeAuditResult = { ok: true; message: string } | { ok: false; status: number; message: string; errors?: Record<string, string[]> };
const THANKS = 'Obrigado! Estamos a analisar o seu site: vai receber a análise por email dentro de alguns minutos.';

export async function submitFreeAudit(token: string, fields: Record<string, unknown>, meta: { ip: string | null }): Promise<FreeAuditResult> {
  // Robôs preenchem o campo escondido: responde-se como se tivesse corrido bem.
  if (typeof fields._gotcha === 'string' && fields._gotcha.trim()) return { ok: true, message: THANKS };
  const ws = await workspaceFor(token);
  if (!ws) return { ok: false, status: 404, message: 'Esta página não existe ou foi desligada.' };
  if (rateLimited(`${token}:${meta.ip ?? '?'}`)) return { ok: false, status: 429, message: 'Demasiados pedidos. Tente daqui a alguns minutos.' };
  const parsed = FreeAuditSubmitSchema.safeParse({ ...fields, consent: fields.consent === true || fields.consent === 'on' || fields.consent === 'true' });
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (errors[String(issue.path[0] ?? 'form')] ??= []).push(issue.message);
    return { ok: false, status: 422, message: 'Verifique os campos assinalados.', errors };
  }
  const input = parsed.data;
  // Endereços locais (IP, localhost) só nos testes; em produção não há site para analisar.
  const rawHost = new URL(input.website).hostname;
  if (process.env.AUDIT_ALLOW_PRIVATE !== '1' && (rawHost === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawHost))) {
    return { ok: false, status: 422, message: 'Verifique os campos assinalados.', errors: { website: ['Endereço inválido (ex.: www.o-meu-negocio.pt).'] } };
  }
  const ctx = await systemContext(ws, null);
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
      leadId = (await createLead(ctx, lead, { force: true })).id;
    }
  } catch (error) {
    const extra = (error instanceof ApiError ? error.extra : null) as { do_not_contact?: unknown[] } | null;
    if (extra?.do_not_contact) return { ok: true, message: THANKS };
    console.error('[análise grátis] lead', error instanceof Error ? error.message : error);
    return { ok: false, status: 500, message: 'Não foi possível enviar o pedido. Tente outra vez daqui a pouco.' };
  }

  await createActivity(ctx, leadId, {
    type: 'note',
    body: `🔎 Pediu a análise grátis do site (${host}) pela tua página${input.name ? ` — ${input.name}` : ''} <${input.email}>.`,
    payload: { via: 'site_form', free_audit: true, created },
  }).catch(() => undefined);

  // Em segundo plano: analisar, enviar o PDF e avisar (o visitante não fica à espera).
  void finishFreeAudit(ctx, leadId, input.website, input.email, input.name, company, host);
  return { ok: true, message: THANKS };
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
      await sendLeadEmail(ctx, leadId, LeadEmailSendSchema.parse({ to, subject: email.subject, body: email.body, attach_diagnosis: true, template: 'Análise grátis do site' }));
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
