/**
 * Propostas comerciais e pacotes de serviços.
 */
import {
  LEAD_STATUSES,
  addDays,
  formatCurrency,
  proposalCode,
  proposalTotals,
  todayIso,
  type Lead,
  type Proposal,
  type ProposalItem,
  type ServicePackage,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { getLead } from './leads';
import { getSettings } from './workspace';

// -----------------------------------------------------------------------------
// Pacotes
// -----------------------------------------------------------------------------
const PACKAGE_SELECT = 'id, name, description, price, features, delivery_days, recommended, sort_order, archived_at';

const toPackage = (row: Record<string, unknown>) => ({ ...row, price: Number(row.price) }) as ServicePackage;

export async function listPackages(ctx: ApiContext, includeArchived = false): Promise<ServicePackage[]> {
  let q = ctx.supabase
    .from('service_packages')
    .select(PACKAGE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order')
    .order('name');
  if (!includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw fromPostgrest(error);
  return (data ?? []).map(toPackage);
}

export async function createPackage(
  ctx: ApiContext,
  input: Omit<ServicePackage, 'id' | 'archived_at' | 'sort_order'> & { sort_order?: number },
): Promise<ServicePackage> {
  const sortOrder = input.sort_order ?? (await listPackages(ctx, true)).length + 1;
  const result = await ctx.supabase
    .from('service_packages')
    .insert({ ...input, sort_order: sortOrder, workspace_id: ctx.workspaceId })
    .select(PACKAGE_SELECT)
    .single();
  return toPackage(unwrap(result) as Record<string, unknown>);
}

export async function updatePackage(
  ctx: ApiContext,
  id: string,
  patch: Partial<Omit<ServicePackage, 'id' | 'archived_at'>> & { archived?: boolean },
): Promise<ServicePackage> {
  const { archived, ...rest } = patch;
  const result = await ctx.supabase
    .from('service_packages')
    .update({ ...rest, ...(archived === undefined ? {} : { archived_at: archived ? new Date().toISOString() : null }) })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(PACKAGE_SELECT)
    .maybeSingle();
  return toPackage(unwrap(result, 'Pacote não encontrado') as Record<string, unknown>);
}

export async function deletePackage(ctx: ApiContext, id: string): Promise<void> {
  const { error, count } = await ctx.supabase
    .from('service_packages')
    .delete({ count: 'exact' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id);
  if (error) throw fromPostgrest(error);
  if (!count) throw new ApiError(404, 'Pacote não encontrado');
}

// -----------------------------------------------------------------------------
// Propostas
// -----------------------------------------------------------------------------
const PROPOSAL_SELECT =
  'id, lead_id, number, title, intro, items, discount, total, valid_until, payment_terms, notes, status, sent_at, created_at, updated_at';

function toProposal(row: Record<string, unknown>): Proposal {
  return {
    ...(row as Omit<Proposal, 'code'>),
    discount: Number(row.discount),
    total: Number(row.total),
    items: ((row.items as ProposalItem[]) ?? []).map((i) => ({ ...i, price: Number(i.price) })),
    code: proposalCode(row.number as number, row.created_at as string),
  };
}

export async function listProposals(ctx: ApiContext, leadId: string): Promise<Proposal[]> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('proposals')
    .select(PROPOSAL_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw fromPostgrest(error);
  return (data ?? []).map(toProposal);
}

export async function getProposal(ctx: ApiContext, id: string): Promise<Proposal> {
  const result = await ctx.supabase
    .from('proposals')
    .select(PROPOSAL_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  return toProposal(unwrap(result, 'Proposta não encontrada') as Record<string, unknown>);
}

export interface ProposalInput {
  title?: string;
  intro?: string | null;
  items?: ProposalItem[];
  discount?: number;
  valid_until?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  status?: Proposal['status'];
}

export async function createProposal(ctx: ApiContext, leadId: string, input: ProposalInput & { title: string; items: ProposalItem[] }) {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível criar propostas para um lead anonimizado.');
  const settings = await getSettings(ctx);
  const discount = input.discount ?? 0;
  const result = await ctx.supabase
    .from('proposals')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      title: input.title,
      intro: input.intro ?? null,
      items: input.items,
      discount,
      total: proposalTotals(input.items, discount).total,
      valid_until: input.valid_until ?? addDays(todayIso(), settings.proposal.validity_days),
      payment_terms: input.payment_terms ?? settings.proposal.payment_terms,
      notes: input.notes ?? null,
      created_by: ctx.user.id,
    })
    .select(PROPOSAL_SELECT)
    .single();
  return toProposal(unwrap(result) as Record<string, unknown>);
}

export async function updateProposal(ctx: ApiContext, id: string, patch: ProposalInput): Promise<Proposal> {
  const current = await getProposal(ctx, id);
  const items = patch.items ?? current.items;
  const discount = patch.discount ?? current.discount;
  const result = await ctx.supabase
    .from('proposals')
    .update({ ...patch, total: proposalTotals(items, discount).total })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(PROPOSAL_SELECT)
    .maybeSingle();
  return toProposal(unwrap(result, 'Proposta não encontrada') as Record<string, unknown>);
}

export async function deleteProposal(ctx: ApiContext, id: string): Promise<void> {
  await getProposal(ctx, id);
  const { error } = await ctx.supabase.from('proposals').delete().eq('workspace_id', ctx.workspaceId).eq('id', id);
  if (error) throw fromPostgrest(error);
}

/**
 * Marca a proposta como enviada: regista a atividade e, se o lead ainda estiver
 * numa etapa anterior, passa-o para "Proposta enviada".
 */
export async function markProposalSent(ctx: ApiContext, id: string): Promise<{ proposal: Proposal; lead: Lead }> {
  const proposal = await updateProposalStatus(ctx, id, 'enviada');
  const lead = await getLead(ctx, proposal.lead_id);
  // Só avança leads em etapas anteriores (identificado → reunião); não mexe em clientes, perdidos ou em pausa.
  let updated = lead;
  if (LEAD_STATUSES.indexOf(lead.status) < LEAD_STATUSES.indexOf('proposta_enviada')) {
    const result = await ctx.supabase
      .from('leads')
      .update({ status: 'proposta_enviada', estimated_value: lead.estimated_value ?? proposal.total })
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', lead.id)
      .select('id')
      .maybeSingle();
    if (result.error) throw fromPostgrest(result.error);
    updated = await getLead(ctx, lead.id);
  }
  return { proposal, lead: updated };
}

async function updateProposalStatus(ctx: ApiContext, id: string, status: Proposal['status']) {
  const current = await getProposal(ctx, id);
  const result = await ctx.supabase
    .from('proposals')
    .update({ status, sent_at: status === 'enviada' ? new Date().toISOString() : current.sent_at })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(PROPOSAL_SELECT)
    .maybeSingle();
  const proposal = toProposal(unwrap(result, 'Proposta não encontrada') as Record<string, unknown>);
  const { error } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: proposal.lead_id,
    type: 'proposal_generated',
    payload: { proposal_id: proposal.id, code: proposal.code, total: formatCurrency(proposal.total), status },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);
  return proposal;
}
