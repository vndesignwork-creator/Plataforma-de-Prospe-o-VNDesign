/**
 * Contratos: gerar a partir da proposta, editar enquanto não forem aceites,
 * marcar como enviados, PDF e aceitação online pelo cliente (/c/<código>).
 */
import { randomBytes } from 'node:crypto';
import {
  WorkspaceSettingsSchema,
  buildContractContent,
  serviceTemplateValues,
  type ContractUpdate,
  type LeadContract,
  type Proposal,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { renderContractPdf } from '../proposals/contract-pdf';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead } from './leads';
import { listPayments } from './payments';
import { getProjectInfo } from './project-tools';
import { listProposals } from './proposals';
import { alertUser } from './push';
import { loadServiceCatalog } from './service-catalog';
import { loadServiceCategories } from './service-categories';
import { getSettings, getSignature } from './workspace';

const SELECT = 'id, lead_id, proposal_id, number, title, content, status, token, sent_at, accepted_at, accepted_name, created_at, updated_at';
const NOT_FOUND = 'Contrato não encontrado';

export async function listContracts(ctx: ApiContext, leadId: string): Promise<LeadContract[]> {
  const { data, error } = await ctx.supabase
    .from('lead_contracts')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw fromPostgrest(error);
  return (data ?? []) as LeadContract[];
}

async function getContract(ctx: ApiContext, id: string): Promise<LeadContract> {
  const { data, error } = await ctx.supabase.from('lead_contracts').select(SELECT).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  if (!data) throw new ApiError(404, NOT_FOUND);
  return data as LeadContract;
}

/** Novo contrato com as cláusulas de partida (proposta aceite ou a mais recente). */
export async function createContract(ctx: ApiContext, leadId: string, proposalId?: string | null): Promise<LeadContract> {
  const [lead, signature, settings, proposals, info, payments, catalog, categories] = await Promise.all([
    getLead(ctx, leadId),
    getSignature(ctx),
    getSettings(ctx),
    listProposals(ctx, leadId),
    getProjectInfo(ctx, leadId),
    listPayments(ctx, leadId),
    loadServiceCatalog(ctx),
    loadServiceCategories(ctx),
  ]);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível criar contratos para um lead anonimizado.');
  const proposal: Proposal | undefined = proposalId
    ? proposals.find((p) => p.id === proposalId)
    : (proposals.find((p) => p.status === 'aceite') ?? proposals.find((p) => p.status === 'enviada') ?? proposals[0]);
  if (proposalId && !proposal) throw new ApiError(404, 'Proposta não encontrada');

  const content = buildContractContent({
    provider: {
      name: signature.full_name || ctx.user.email || 'Prestador',
      company: signature.company ?? null,
      nif: settings.contract.provider_nif || null,
      address: null,
      email: signature.email ?? ctx.user.email,
      phone: signature.phone ?? null,
    },
    client: {
      name: lead.contact_name || lead.company_name,
      company: lead.contact_name ? lead.company_name : null,
      nif: null,
      address: [lead.address, lead.city].filter(Boolean).join(', ') || null,
      email: lead.email,
      phone: lead.phone,
    },
    proposal: proposal ? { items: proposal.items, total: proposal.total, payment_terms: proposal.payment_terms } : null,
    servicesText: serviceTemplateValues(lead.services, catalog, categories).servicos,
    estimatedValue: lead.estimated_value,
    dueOn: info.due_on,
    revisionsIncluded: info.revisions_included,
    payments: payments.map((p) => ({ description: p.description, amount: p.amount, due_on: p.due_on })),
    taxNote: settings.proposal.tax_note,
    clauses: settings.contract.clauses,
  });

  const { data: last } = await ctx.supabase
    .from('lead_contracts')
    .select('number')
    .eq('workspace_id', ctx.workspaceId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await ctx.supabase
    .from('lead_contracts')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      proposal_id: proposal?.id ?? null,
      number: ((last?.number as number | undefined) ?? 0) + 1,
      title: `Contrato de prestação de serviços — ${lead.company_name}`.slice(0, 200),
      content,
      token: randomBytes(18).toString('base64url'),
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return data as LeadContract;
}

export async function updateContract(ctx: ApiContext, id: string, patch: ContractUpdate): Promise<LeadContract> {
  const current = await getContract(ctx, id);
  if (current.status === 'aceite') throw new ApiError(422, 'Contrato aceite', 'Este contrato já foi aceite pelo cliente e não pode ser alterado.');
  const { data, error } = await ctx.supabase.from('lead_contracts').update(patch).eq('workspace_id', ctx.workspaceId).eq('id', id).select(SELECT).single();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  return data as LeadContract;
}

/** Marca como enviado (ao copiar o link ou enviar por email) e regista na linha do tempo. */
export async function markContractSent(ctx: ApiContext, id: string): Promise<LeadContract> {
  const current = await getContract(ctx, id);
  if (current.status !== 'rascunho') return current;
  const { data, error } = await ctx.supabase
    .from('lead_contracts')
    .update({ status: 'enviado', sent_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: current.lead_id,
    type: 'contract_sent',
    payload: { title: current.title, number: current.number },
    actor_user_id: ctx.user.id,
  });
  return data as LeadContract;
}

export async function deleteContract(ctx: ApiContext, id: string): Promise<void> {
  const current = await getContract(ctx, id);
  if (current.status === 'aceite') throw new ApiError(422, 'Contrato aceite', 'Um contrato aceite pelo cliente não pode ser apagado.');
  const { error } = await ctx.supabase.from('lead_contracts').delete().eq('workspace_id', ctx.workspaceId).eq('id', id);
  if (error) throw fromPostgrest(error, NOT_FOUND);
}

const fileName = (c: Pick<LeadContract, 'number'>) => `Contrato-${String(c.number).padStart(3, '0')}.pdf`;

export async function contractPdf(ctx: ApiContext, id: string): Promise<{ content: Buffer; filename: string }> {
  const contract = await getContract(ctx, id);
  return { content: await renderContractPdf(contract), filename: fileName(contract) };
}

// -----------------------------------------------------------------------------
// Link do cliente (sem sessão)
// -----------------------------------------------------------------------------

/** O contrato do link /c/<código>, ou null se não existir (ou os contratos estiverem desligados). */
export async function getPublicContract(token: string): Promise<(LeadContract & { workspace_id: string; created_by: string | null }) | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from('lead_contracts').select(`${SELECT}, workspace_id, created_by`).eq('token', token).maybeSingle();
  if (!data) return null;
  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', data.workspace_id).maybeSingle();
  if (!WorkspaceSettingsSchema.parse(ws?.settings ?? {}).features.contracts) return null;
  return data as LeadContract & { workspace_id: string; created_by: string | null };
}

export async function publicContractPdf(token: string): Promise<{ content: Buffer; filename: string } | null> {
  const contract = await getPublicContract(token);
  if (!contract) return null;
  return { content: await renderContractPdf(contract), filename: fileName(contract) };
}

/** O cliente aceita o contrato: nome, data e hora e IP ficam registados; avisa quem o criou. */
export async function acceptContract(token: string, name: string, ip: string | null): Promise<LeadContract> {
  const contract = await getPublicContract(token);
  if (!contract) throw new ApiError(404, NOT_FOUND);
  if (contract.status === 'aceite') return contract;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('lead_contracts')
    .update({ status: 'aceite', accepted_at: new Date().toISOString(), accepted_name: name, accepted_ip: ip, sent_at: contract.sent_at ?? new Date().toISOString() })
    .eq('id', contract.id)
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  await admin.from('lead_activities').insert({
    workspace_id: contract.workspace_id,
    lead_id: contract.lead_id,
    type: 'contract_accepted',
    payload: { title: contract.title, number: contract.number, name },
  });
  if (contract.created_by) {
    await alertUser(contract.workspace_id, contract.created_by, {
      kind: 'client',
      leadId: contract.lead_id,
      title: '✍️ Contrato aceite',
      body: `${name} aceitou "${contract.title}".`,
      url: `/leads/${contract.lead_id}#contratos`,
      tag: `contract-${contract.id}`,
    }).catch(() => undefined);
  }
  return data as LeadContract;
}
