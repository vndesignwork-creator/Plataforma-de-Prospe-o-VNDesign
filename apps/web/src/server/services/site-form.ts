/**
 * Formulário do site: endereço público (/api/v1/public/forms/<código>) que cria
 * o lead (canal "Formulário do site"), regista a mensagem na linha do tempo,
 * cria a tarefa "Responder ao pedido do site" para hoje e avisa o dono.
 * Se a pessoa já for um lead (mesmo email/nome/site), junta-se a esse.
 */
import { randomBytes } from 'node:crypto';
import { LeadCreateSchema, leadPath, normalizeEmail, parseSiteFormFields, todayIso, type SiteFormSettings } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { createActivity } from './activities';
import { createLead, updateLead } from './leads';
import { alertUser } from './push';
import { createTask } from './tasks';
import { getSettings } from './workspace';

/** Ligar/desligar (ou trocar o código). Só o dono ou um administrador. */
export async function setSiteForm(ctx: ApiContext, input: { enabled: boolean; rotate: boolean }): Promise<SiteFormSettings> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem permissão', 'Só o dono ou um administrador pode mudar o formulário do site.');
  const current = await getSettings(ctx);
  const token = !input.enabled ? null : input.rotate || !current.site_form.token ? randomBytes(18).toString('base64url') : current.site_form.token;
  const next = { ...current, site_form: { token } };
  const { error } = await ctx.supabase.from('workspaces').update({ settings: next }).eq('id', ctx.workspaceId);
  if (error) throw fromPostgrest(error);
  return next.site_form;
}

// Limite simples por endereço (contra spam): 5 pedidos por 10 minutos.
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > 5;
}

export type SiteFormResult = { ok: true; message: string } | { ok: false; status: number; message: string };

const THANKS = 'Obrigado! Recebemos o seu pedido e respondemos em breve.';

export async function submitSiteForm(token: string, fields: Record<string, string>, meta: { ip: string | null; referer: string | null }): Promise<SiteFormResult> {
  // Robôs preenchem o campo escondido: responde-se como se tivesse corrido bem.
  if (fields._gotcha?.trim()) return { ok: true, message: THANKS };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, status: 404, message: 'Formulário desconhecido.' };

  const admin = createSupabaseAdminClient();
  const { data: ws } = await admin.from('workspaces').select('id').eq('settings->site_form->>token', token).maybeSingle();
  if (!ws) return { ok: false, status: 404, message: 'Formulário desconhecido ou desligado.' };
  if (rateLimited(`${token}:${meta.ip ?? '?'}`)) return { ok: false, status: 429, message: 'Demasiados pedidos. Tente daqui a alguns minutos.' };

  const f = parseSiteFormFields(fields);
  if (!f.email && !f.phone) return { ok: false, status: 422, message: 'Indique o email ou o telefone, para podermos responder.' };

  const ctx = await systemContext(ws.id as string, null);
  if (!ctx) return { ok: false, status: 404, message: 'Formulário desconhecido.' };

  const company = f.company ?? f.name ?? f.email ?? f.phone!;
  const message = [f.service ? `Assunto: ${f.service}` : null, f.message, meta.referer ? `Página: ${meta.referer}` : null].filter(Boolean).join('\n\n') || null;

  let leadId: string;
  let created = true;
  const input = LeadCreateSchema.parse({
    company_name: company,
    contact_name: f.name,
    email: f.email,
    phone: f.phone,
    website: f.website,
    channel: 'site',
    status: 'respondeu',
    next_action_text: 'Responder ao pedido do site',
    next_action_on: todayIso(),
  });
  // Já é lead (mesmo email)? Junta o pedido a esse.
  const email = normalizeEmail(f.email);
  const { data: existing } = email
    ? await ctx.supabase
        .from('leads')
        .select('id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('email_normalized', email)
        .is('anonymized_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };
  try {
    if (existing) {
      leadId = (existing as { id: string }).id;
      created = false;
      await updateLead(ctx, leadId, { next_action_on: todayIso(), next_action_text: 'Responder ao pedido do site' });
    } else {
      // Um pedido que chega é sempre um lead novo (parecidos não bloqueiam; a lista "não contactar" sim).
      leadId = (await createLead(ctx, input, { force: true })).id;
    }
  } catch (error) {
    const extra = (error instanceof ApiError ? error.extra : null) as { do_not_contact?: unknown[] } | null;
    if (error instanceof ApiError && extra?.do_not_contact) {
      await alertUser(ctx.workspaceId, ctx.user.id, {
        kind: 'site_form',
        title: '📥 Pedido pelo site (lista "não contactar")',
        body: `${company} enviou um pedido, mas está na lista "não contactar". Vê nas Definições.`,
        url: '/definicoes/nao-contactar',
        tag: `site-form-dnc-${Date.now()}`,
      }).catch(() => undefined);
      return { ok: true, message: THANKS };
    } else {
      console.error('[formulário do site] não foi possível criar o lead', error instanceof Error ? error.message : error);
      return { ok: false, status: 500, message: 'Não foi possível enviar. Tente outra vez ou contacte-nos por telefone.' };
    }
  }

  await createActivity(ctx, leadId, {
    type: 'note',
    body: `📥 Pedido pelo formulário do site${f.name ? ` — ${f.name}` : ''}${f.email ? ` <${f.email}>` : ''}${f.phone ? ` · ${f.phone}` : ''}${message ? `\n\n${message}` : ''}`,
    payload: { via: 'site_form', created },
  }).catch((e) => console.error('[formulário do site] atividade', e instanceof Error ? e.message : e));
  await createTask(ctx, leadId, { title: 'Responder ao pedido do site', due_on: todayIso(), remind_at: null }).catch((e) =>
    console.error('[formulário do site] tarefa', e instanceof Error ? e.message : e),
  );

  const { data: lead } = await admin.from('leads').select('id, number, company_name').eq('id', leadId).maybeSingle();
  await alertUser(ctx.workspaceId, ctx.user.id, {
    kind: 'site_form',
    leadId,
    title: created ? '📥 Novo pedido pelo site' : '📥 Novo pedido pelo site (lead que já existia)',
    body: `${f.name ?? company}${f.message ? `: ${f.message.slice(0, 120)}` : ''}`,
    url: lead ? leadPath(lead as { id: string; number: number; company_name: string }) : '/leads',
    tag: `site-form-${leadId}`,
  }).catch(() => undefined);
  return { ok: true, message: THANKS };
}
