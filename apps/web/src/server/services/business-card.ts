/**
 * Cartão de contacto partilhável (/cartao/<código>): os dados vêm da assinatura e
 * a foto do perfil. Quem o abre pode guardar o contacto (vCard) e deixar o seu
 * (fica lead, canal "Pessoal", com tarefa para responder e um aviso).
 */
import { randomBytes } from 'node:crypto';
import { LeadCreateSchema, leadPath, normalizeEmail, todayIso, type BusinessCard, type BusinessCardUpdate, type CardContact, type PublicBusinessCard } from '@vndesign/core';
import QRCode from 'qrcode';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { createActivity } from './activities';
import { createLead, updateLead } from './leads';
import { alertUser } from './push';
import { createTask } from './tasks';

type Row = { id: string; workspace_id: string; user_id: string; token: string; enabled: boolean; bio: string | null; views: number };
const SELECT = 'id, workspace_id, user_id, token, enabled, bio, views';
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const newToken = () => randomBytes(15).toString('base64url');

async function view(row: Row | null, origin: string): Promise<BusinessCard> {
  if (!row) return { enabled: false, token: null, bio: null, views: 0, url: null, qr_svg: null };
  const url = `${origin}/cartao/${row.token}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#141414', light: '#ffffff' } });
  return { enabled: row.enabled, token: row.token, bio: row.bio, views: row.views, url, qr_svg: qr };
}

async function myRow(ctx: ApiContext): Promise<Row | null> {
  const { data, error } = await ctx.supabase.from('business_cards').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id).maybeSingle();
  // Antes da migração 20261108002400: sem cartão.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return null;
  if (error) throw fromPostgrest(error);
  return (data as Row | null) ?? null;
}

export async function getMyCard(ctx: ApiContext, origin: string): Promise<BusinessCard> {
  return view(await myRow(ctx), origin);
}

export async function updateMyCard(ctx: ApiContext, input: BusinessCardUpdate, origin: string): Promise<BusinessCard> {
  const current = await myRow(ctx);
  if (!current) {
    // Primeira vez: cria o cartão (ligado, a não ser que se peça desligado).
    const { data, error } = await ctx.supabase
      .from('business_cards')
      .insert({ workspace_id: ctx.workspaceId, user_id: ctx.user.id, token: newToken(), enabled: input.enabled ?? true, bio: input.bio ?? null })
      .select(SELECT)
      .single();
    if (error?.code === '42P01' || error?.code === 'PGRST205') {
      throw new ApiError(503, 'Cartão ainda não disponível', 'A base de dados ainda não foi atualizada (npx supabase db push).');
    }
    if (error) throw fromPostgrest(error);
    return view(data as Row, origin);
  }
  const patch: Record<string, unknown> = {};
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.rotate) patch.token = newToken();
  if (!Object.keys(patch).length) return view(current, origin);
  const { data, error } = await ctx.supabase.from('business_cards').update(patch).eq('id', current.id).select(SELECT).single();
  if (error) throw fromPostgrest(error);
  return view(data as Row, origin);
}

type Loaded = { row: Row; card: PublicBusinessCard; avatarPath: string | null; logoPath: string | null };

/** O cartão pelo código (só se estiver ligado). */
async function load(token: string): Promise<Loaded | null> {
  if (!TOKEN.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin.from('business_cards').select(SELECT).eq('token', token).eq('enabled', true).maybeSingle();
  if (error || !row) return null;
  const r = row as Row;
  const [sig, profile, member] = await Promise.all([
    admin
      .from('signatures')
      .select('full_name, role_title, company, phone, email, website, portfolio_url, logo_path')
      .eq('workspace_id', r.workspace_id)
      .eq('user_id', r.user_id)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('user_profiles').select('display_name, avatar_path').eq('workspace_id', r.workspace_id).eq('user_id', r.user_id).maybeSingle(),
    admin.from('workspace_members').select('user_id').eq('workspace_id', r.workspace_id).eq('user_id', r.user_id).maybeSingle(),
  ]);
  // Quem saiu da equipa deixa de ter cartão.
  if (!member.data) return null;
  const s = (sig.data ?? {}) as Partial<Record<'full_name' | 'role_title' | 'company' | 'phone' | 'email' | 'website' | 'portfolio_url' | 'logo_path', string | null>>;
  const p = (profile.data ?? {}) as { display_name?: string | null; avatar_path?: string | null };
  const name = s.full_name?.trim() || p.display_name?.trim();
  if (!name) return null;
  return {
    row: r,
    avatarPath: p.avatar_path ?? null,
    logoPath: s.logo_path ?? null,
    card: {
      full_name: name,
      role_title: s.role_title ?? null,
      company: s.company ?? null,
      phone: s.phone ?? null,
      email: s.email ?? null,
      website: s.website ?? null,
      portfolio_url: s.portfolio_url ?? null,
      bio: r.bio,
      photo: !!p.avatar_path,
      logo: !!s.logo_path,
    },
  };
}

/** Para a página pública (conta mais uma visita). */
export async function getPublicCard(token: string, options: { countView?: boolean } = {}): Promise<PublicBusinessCard | null> {
  const loaded = await load(token);
  if (!loaded) return null;
  if (options.countView) {
    await createSupabaseAdminClient()
      .from('business_cards')
      .update({ views: loaded.row.views + 1 })
      .eq('id', loaded.row.id)
      .then(() => undefined, () => undefined);
  }
  return loaded.card;
}

/** Link temporário da foto do perfil ("photo") ou do logótipo ("logo"). */
export async function publicCardImageUrl(token: string, which: 'photo' | 'logo'): Promise<string | null> {
  const loaded = await load(token);
  const path = which === 'photo' ? loaded?.avatarPath : loaded?.logoPath;
  if (!path) return null;
  const { data } = await createSupabaseAdminClient()
    .storage.from(which === 'photo' ? 'avatars' : 'signature-logos')
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// Limite simples contra spam: 5 contactos por 10 minutos por cartão e endereço.
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > 5;
}

const THANKS = 'Obrigado! Recebi o seu contacto e respondo em breve.';
export type CardContactResult = { ok: true; message: string } | { ok: false; status: number; message: string };

/** "Deixe o seu contacto": cria o lead (ou junta a um que já exista com o mesmo email). */
export async function submitCardContact(token: string, input: CardContact, ip: string | null): Promise<CardContactResult> {
  if (input._gotcha?.trim()) return { ok: true, message: THANKS };
  const loaded = await load(token);
  if (!loaded) return { ok: false, status: 404, message: 'Cartão desconhecido ou desligado.' };
  if (rateLimited(`${token}:${ip ?? '?'}`)) return { ok: false, status: 429, message: 'Demasiados pedidos. Tente daqui a alguns minutos.' };
  const ctx = await systemContext(loaded.row.workspace_id, loaded.row.user_id);
  if (!ctx) return { ok: false, status: 404, message: 'Cartão desconhecido.' };

  const next = 'Responder a quem deixou o contacto no cartão';
  const email = normalizeEmail(input.email);
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
  let leadId: string;
  let created = true;
  try {
    if (existing) {
      leadId = (existing as { id: string }).id;
      created = false;
      await updateLead(ctx, leadId, { next_action_on: todayIso(), next_action_text: next });
    } else {
      const lead = LeadCreateSchema.parse({
        company_name: input.company || input.name,
        contact_name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        channel: 'pessoal',
        status: 'respondeu',
        assigned_to: loaded.row.user_id,
        next_action_text: next,
        next_action_on: todayIso(),
      });
      leadId = (await createLead(ctx, lead, { force: true, origin: 'business_card' })).id;
    }
  } catch (error) {
    const extra = (error instanceof ApiError ? error.extra : null) as { do_not_contact?: unknown[] } | null;
    // Na lista "não contactar": agradece na mesma (não diz nada a quem preencheu).
    if (error instanceof ApiError && extra?.do_not_contact) return { ok: true, message: THANKS };
    console.error('[cartão] não foi possível criar o lead', error instanceof Error ? error.message : error);
    return { ok: false, status: 500, message: 'Não foi possível enviar. Tente outra vez ou ligue-me.' };
  }

  await createActivity(ctx, leadId, {
    type: 'note',
    body: `📇 Contacto deixado no cartão — ${input.name}${input.email ? ` <${input.email}>` : ''}${input.phone ? ` · ${input.phone}` : ''}${input.message ? `\n\n${input.message}` : ''}`,
    payload: { via: 'business_card', created },
  }).catch((e) => console.error('[cartão] atividade', e instanceof Error ? e.message : e));
  await createTask(ctx, leadId, { title: next, due_on: todayIso(), remind_at: null, assigned_to: loaded.row.user_id }).catch((e) =>
    console.error('[cartão] tarefa', e instanceof Error ? e.message : e),
  );
  const { data: lead } = await createSupabaseAdminClient().from('leads').select('id, number, company_name').eq('id', leadId).maybeSingle();
  await alertUser(ctx.workspaceId, loaded.row.user_id, {
    kind: 'site_form',
    leadId,
    title: created ? '📇 Novo contacto pelo cartão' : '📇 Novo contacto pelo cartão (lead que já existia)',
    body: `${input.name}${input.message ? `: ${input.message.slice(0, 120)}` : ''}`,
    url: lead ? leadPath(lead as { id: string; number: number; company_name: string }) : '/leads',
    tag: `card-${leadId}`,
  }).catch(() => undefined);
  return { ok: true, message: THANKS };
}
