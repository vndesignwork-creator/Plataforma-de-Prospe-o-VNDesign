/**
 * Serviço de leads — usado pelos route handlers da API (e, mais tarde, pela
 * importação e pela API de integração). Toda a lógica de duplicados e da lista
 * "não contactar" vive aqui e nas funções SQL.
 */
import {
  addDays,
  fixDirectoryWebsite,
  isDirectoryUrl,
  normalizeText,
  todayIso,
  type DoNotContact,
  type DuplicateCheckResult,
  type DuplicateMatch,
  type Lead,
  type LeadBulkAction,
  type LeadBulkResult,
  type LeadCreate,
  type LeadListQuery,
  type LeadUpdate,
} from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';

export const LEAD_SELECT = [
  'id', 'number', 'company_name', 'sector_id', 'sector:sectors(id, name, slug, emoji, icon)',
  'website', 'city', 'address', 'latitude', 'longitude', 'geocode_status', 'problems', 'pagespeed', 'mobile',
  'email', 'phone', 'contact_name', 'status', 'channel', 'first_contact_on', 'last_follow_up_on',
  'next_action_text', 'next_action_on', 'estimated_value', 'notes', 'approach_angle', 'source_url',
  'suggested_on', 'email_subject', 'email_body', 'services', 'kanban_position', 'status_changed_at',
  'anonymized_at', 'archived_at', 'created_by', 'created_at', 'updated_at',
].join(', ');

const NOT_FOUND = 'Lead não encontrado';
const CLOSED_STATUSES = '(cliente,sem_interesse)';

/** Escapa os caracteres especiais do LIKE. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function baseLeadQuery(ctx: ApiContext) {
  return ctx.supabase
    .from('leads')
    .select(LEAD_SELECT, { count: 'exact' })
    .eq('workspace_id', ctx.workspaceId);
}
type LeadQueryBuilder = ReturnType<typeof baseLeadQuery>;

/** Filtros comuns à lista, ao Kanban e à exportação. */
export type LeadFilters = Partial<
  Pick<
    LeadListQuery,
    'q' | 'sector' | 'status' | 'channel' | 'city' | 'suggested_from' | 'suggested_to' | 'due' | 'include_anonymized' | 'archived' | 'service'
  >
>;

function applyLeadFilters(q: LeadQueryBuilder, query: LeadFilters): LeadQueryBuilder {
  if (query.include_anonymized !== 'true') q = q.is('anonymized_at', null);
  // Arquivados: por omissão ficam de fora (lista, Kanban, mapa, exportação).
  if (query.archived === 'only') q = q.not('archived_at', 'is', null);
  else if (query.archived !== 'include') q = q.is('archived_at', null);

  if (query.q) {
    const term = normalizeText(query.q);
    if (term) q = q.ilike('search_text', `%${likeEscape(term)}%`);
  }
  if (query.sector?.length) {
    const ids = query.sector.filter((s) => s !== 'none');
    const parts = [
      ...(ids.length ? [`sector_id.in.(${ids.join(',')})`] : []),
      ...(query.sector.includes('none') ? ['sector_id.is.null'] : []),
    ];
    q = q.or(parts.join(','));
  }
  if (query.status?.length) q = q.in('status', query.status);
  if (query.channel?.length) {
    const channels = query.channel.filter((c) => c !== 'none');
    const parts = [
      ...(channels.length ? [`channel.in.(${channels.join(',')})`] : []),
      ...(query.channel.includes('none') ? ['channel.is.null'] : []),
    ];
    q = q.or(parts.join(','));
  }
  if (query.service?.length) {
    // Basta um dos serviços escolhidos coincidir ("ov" = interseção de arrays).
    const keys = query.service.filter((k) => k !== 'none');
    const parts = [
      ...(keys.length ? [`services.ov.{${keys.join(',')}}`] : []),
      ...(query.service.includes('none') ? ['services.eq.{}'] : []),
    ];
    q = q.or(parts.join(','));
  }
  if (query.city) q = q.ilike('city', `%${likeEscape(query.city)}%`);
  if (query.suggested_from) q = q.gte('suggested_on', query.suggested_from);
  if (query.suggested_to) q = q.lte('suggested_on', query.suggested_to);
  if (query.due) {
    const today = todayIso();
    q = q.not('status', 'in', CLOSED_STATUSES).not('next_action_on', 'is', null);
    if (query.due === 'overdue') q = q.lt('next_action_on', today);
    if (query.due === 'today') q = q.eq('next_action_on', today);
    if (query.due === 'week') q = q.gte('next_action_on', today).lte('next_action_on', addDays(today, 7));
  }
  return q;
}

/** Os mesmos filtros aplicados a uma consulta com outras colunas (ex.: mapa). */
export const applyLeadFiltersTo = applyLeadFilters as unknown as <Q>(q: Q, query: LeadFilters) => Q;

export async function listLeads(ctx: ApiContext, query: LeadListQuery) {
  let q = applyLeadFilters(baseLeadQuery(ctx), query);

  const ascending = query.order === 'asc';
  q = q.order(query.sort, { ascending, nullsFirst: false });
  if (query.sort !== 'number') q = q.order('number', { ascending: false });

  const from = (query.page - 1) * query.limit;
  const { data, error, count } = await q.range(from, from + query.limit - 1);
  if (error) {
    // Página para lá do fim → lista vazia (em vez de erro 416).
    if (error.code === 'PGRST103') return { data: [] as Lead[], total: count ?? 0 };
    throw fromPostgrest(error);
  }
  return { data: (data ?? []) as unknown as Lead[], total: count ?? 0 };
}

export async function getLead(ctx: ApiContext, id: string): Promise<Lead> {
  const result = await ctx.supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  return unwrap(result, NOT_FOUND) as unknown as Lead;
}

export async function checkDuplicates(
  ctx: ApiContext,
  input: { company_name?: string | null; website?: string | null; email?: string | null; exclude_id?: string | null },
): Promise<DuplicateCheckResult> {
  const args = {
    p_workspace_id: ctx.workspaceId,
    p_company_name: input.company_name ?? null,
    p_website: input.website ?? null,
    p_email: input.email ?? null,
  };
  const [dups, dnc] = await Promise.all([
    ctx.supabase.rpc('find_lead_duplicates', { ...args, p_exclude_id: input.exclude_id ?? null }),
    ctx.supabase.rpc('check_do_not_contact', args),
  ]);
  if (dups.error) throw fromPostgrest(dups.error);
  if (dnc.error) throw fromPostgrest(dnc.error);
  return {
    duplicates: (dups.data ?? []) as DuplicateMatch[],
    do_not_contact: ((dnc.data ?? []) as DoNotContact[]).map(pickDoNotContact),
  };
}

export function pickDoNotContact(d: DoNotContact): DoNotContact {
  return {
    id: d.id,
    company_name: d.company_name,
    website: d.website,
    email: d.email,
    reason: d.reason,
    created_at: d.created_at,
  };
}

export async function createLead(
  ctx: ApiContext,
  input: LeadCreate,
  options: { force?: boolean } = {},
): Promise<Lead> {
  // Um diretório (TripAdvisor, Sluurpy, Google Maps…) no Website passa para a Fonte.
  input = { ...input, ...fixDirectoryWebsite(input) };
  const check = await checkDuplicates(ctx, input);

  // A lista "não contactar" bloqueia sempre (não há "criar mesmo assim").
  if (check.do_not_contact.length) {
    throw new ApiError(
      422,
      'Empresa na lista "não contactar"',
      'Esta empresa pediu para não ser contactada. Remove-a da lista nas Definições se tiveres a certeza.',
      { do_not_contact: check.do_not_contact },
    );
  }
  // Só os duplicados "fortes" (mesmo nome normalizado, website ou email) bloqueiam;
  // nomes apenas parecidos aparecem como aviso no formulário.
  const strong = check.duplicates.filter((d) => d.strength === 'strong');
  if (!options.force && strong.length) {
    throw new ApiError(
      409,
      'Possível duplicado',
      'Já existe um lead com o mesmo nome, website ou email. Junta-os ou cria mesmo assim com force=true.',
      { duplicates: check.duplicates },
    );
  }

  const result = await ctx.supabase
    .from('leads')
    .insert({ ...input, workspace_id: ctx.workspaceId, created_by: ctx.user.id })
    .select(LEAD_SELECT)
    .single();
  return unwrap(result) as unknown as Lead;
}

export async function updateLead(ctx: ApiContext, id: string, patch: LeadUpdate): Promise<Lead> {
  if (Object.keys(patch).length === 0) return getLead(ctx, id);
  if (isDirectoryUrl(patch.website)) {
    const current = await getLead(ctx, id);
    patch = {
      ...patch,
      ...fixDirectoryWebsite({
        website: patch.website,
        source_url: patch.source_url !== undefined ? patch.source_url : current.source_url,
        notes: patch.notes !== undefined ? patch.notes : current.notes,
      }),
    };
  }
  const result = await ctx.supabase
    .from('leads')
    .update(patch)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(LEAD_SELECT)
    .maybeSingle();
  return unwrap(result, NOT_FOUND) as unknown as Lead;
}

export async function deleteLead(
  ctx: ApiContext,
  id: string,
  options: { addToDoNotContact?: boolean; reason?: string | null } = {},
): Promise<void> {
  const lead = await getLead(ctx, id);
  if (options.addToDoNotContact) {
    const insert = await ctx.supabase.from('do_not_contact').insert({
      workspace_id: ctx.workspaceId,
      company_name: lead.company_name,
      website: lead.website,
      email: lead.email,
      reason: options.reason ?? 'Pedido de remoção (RGPD)',
      created_by: ctx.user.id,
    });
    if (insert.error) throw fromPostgrest(insert.error);
  }
  const { error } = await ctx.supabase
    .from('leads')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id);
  if (error) throw fromPostgrest(error, NOT_FOUND);
}

export async function anonymizeLead(
  ctx: ApiContext,
  id: string,
  options: { add_to_do_not_contact: boolean; reason?: string | null },
): Promise<Lead> {
  await getLead(ctx, id);
  const { error } = await ctx.supabase.rpc('anonymize_lead', {
    p_lead_id: id,
    p_add_to_do_not_contact: options.add_to_do_not_contact,
    p_reason: options.reason ?? null,
  });
  if (error) throw fromPostgrest(error, NOT_FOUND);
  return getLead(ctx, id);
}

export async function mergeLeads(
  ctx: ApiContext,
  primaryId: string,
  input: { duplicate_ids: string[]; values: LeadUpdate },
): Promise<Lead> {
  await getLead(ctx, primaryId);
  const { error } = await ctx.supabase.rpc('merge_leads', {
    p_primary_id: primaryId,
    p_duplicate_ids: input.duplicate_ids,
    p_values: input.values,
  });
  if (error) throw fromPostgrest(error, NOT_FOUND);
  return getLead(ctx, primaryId);
}

/**
 * Arquivar, repor ou apagar vários leads de uma vez. Só conta os que mudaram
 * (um lead já arquivado não volta a ser arquivado nem regista atividade).
 */
export async function bulkLeadAction(ctx: ApiContext, action: LeadBulkAction, ids: string[]): Promise<LeadBulkResult> {
  const unique = [...new Set(ids)];
  const base = () => ctx.supabase.from('leads');
  let result;
  if (action === 'delete') {
    result = await base().delete().eq('workspace_id', ctx.workspaceId).in('id', unique).select('id');
  } else if (action === 'archive') {
    result = await base()
      .update({ archived_at: new Date().toISOString() })
      .eq('workspace_id', ctx.workspaceId)
      .in('id', unique)
      .is('archived_at', null)
      .select('id');
  } else {
    result = await base()
      .update({ archived_at: null })
      .eq('workspace_id', ctx.workspaceId)
      .in('id', unique)
      .not('archived_at', 'is', null)
      .select('id');
  }
  if (result.error) throw fromPostgrest(result.error);
  return { action, affected: result.data?.length ?? 0 };
}

/** Arquivo automático (cron): leads em "Sem interesse" há mais de N dias, por workspace. */
export async function autoArchiveLeads(admin: SupabaseClient, dryRun = false): Promise<number> {
  const { data, error } = await admin.rpc('auto_archive_leads', { p_dry_run: dryRun });
  if (error) throw fromPostgrest(error);
  return Number(data ?? 0);
}

/** Todos os leads que respeitam os filtros (em blocos de 1000), para exportar. */
export async function listAllLeads(
  ctx: ApiContext,
  filters: LeadFilters,
  order: { sort: string; ascending: boolean } = { sort: 'number', ascending: true },
): Promise<Lead[]> {
  const all: Lead[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 50_000; from += pageSize) {
    const { data, error } = await applyLeadFilters(baseLeadQuery(ctx), filters)
      .order(order.sort, { ascending: order.ascending, nullsFirst: false })
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw fromPostgrest(error);
    all.push(...((data ?? []) as unknown as Lead[]));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

/** Kanban: muda de coluna (estado) e/ou de posição. As regras de estado aplicam-se. */
export async function moveLead(
  ctx: ApiContext,
  id: string,
  move: { status: Lead['status']; position: number },
): Promise<Lead> {
  const result = await ctx.supabase
    .from('leads')
    .update({ status: move.status, kanban_position: move.position })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(LEAD_SELECT)
    .maybeSingle();
  return unwrap(result, NOT_FOUND) as unknown as Lead;
}
