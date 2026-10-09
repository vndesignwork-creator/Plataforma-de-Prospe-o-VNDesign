/**
 * Auditorias de sites guardadas por lead (histórico) e "Aplicar ao lead"
 * (PageSpeed, Mobile? e Problemas).
 */
import type { AuditApply, Lead, LeadUpdate, SiteAudit } from '@vndesign/core';
import { collectAudit } from '../audit/run-audit';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { getLead, updateLead } from './leads';

const AUDIT_SELECT = [
  'id', 'lead_id', 'url', 'final_url', 'status', 'http_status', 'response_ms', 'https', 'ssl_valid',
  'ssl_issuer', 'ssl_expires_at', 'ssl_error', 'has_viewport', 'zoom_blocked', 'pagespeed_mobile',
  'metrics', 'title', 'meta_description', 'cms', 'copyright_year', 'issues', 'suggested_problems',
  'suggested_mobile', 'error', 'created_at',
].join(', ');

const NOT_FOUND = 'Análise não encontrada';

export async function listAudits(ctx: ApiContext, leadId: string): Promise<SiteAudit[]> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('site_audits')
    .select(AUDIT_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw fromPostgrest(error);
  return (data ?? []) as unknown as SiteAudit[];
}

export async function runLeadAudit(ctx: ApiContext, leadId: string, url?: string): Promise<SiteAudit> {
  const lead = await getLead(ctx, leadId);
  const target = url?.trim() || lead.website;
  if (!target) {
    throw new ApiError(422, 'Sem website', 'Este lead não tem website. Indica o endereço a analisar.');
  }

  const record = await collectAudit(target);
  // Endereço inválido ou interno: erro do pedido (não fica no histórico).
  if (record.status === 'error') throw new ApiError(422, 'Não é possível analisar', record.error ?? undefined);
  const result = await ctx.supabase
    .from('site_audits')
    .insert({ ...record, workspace_id: ctx.workspaceId, lead_id: leadId, created_by: ctx.user.id })
    .select(AUDIT_SELECT)
    .single();
  const audit = unwrap(result) as unknown as SiteAudit;

  const { error } = await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: leadId,
    type: 'audit_run',
    payload: {
      audit_id: audit.id,
      url: audit.final_url ?? audit.url,
      status: audit.status,
      pagespeed: audit.pagespeed_mobile,
      issues: audit.issues.length,
    },
    actor_user_id: ctx.user.id,
  });
  if (error) throw fromPostgrest(error);
  return audit;
}

async function getAudit(ctx: ApiContext, leadId: string, auditId: string): Promise<SiteAudit> {
  const result = await ctx.supabase
    .from('site_audits')
    .select(AUDIT_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .eq('id', auditId)
    .maybeSingle();
  return unwrap(result, NOT_FOUND) as unknown as SiteAudit;
}

/** Junta os problemas novos aos existentes, sem repetir. */
export function appendProblems(current: string | null, extra: string): string {
  const parts = (current ?? '').split(/\s*[;\n]\s*/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set(parts.map((p) => p.toLowerCase()));
  for (const p of extra.split(/\s*;\s*/)) {
    if (p && !seen.has(p.toLowerCase())) {
      parts.push(p);
      seen.add(p.toLowerCase());
    }
  }
  return parts.join('; ');
}

export async function applyAudit(ctx: ApiContext, leadId: string, auditId: string, input: AuditApply): Promise<Lead> {
  const [lead, audit] = await Promise.all([getLead(ctx, leadId), getAudit(ctx, leadId, auditId)]);
  if (audit.status !== 'done') throw new ApiError(422, 'Análise sem resultados', 'Esta análise falhou; corre uma nova.');

  const patch: LeadUpdate = {};
  if (input.fields.includes('pagespeed') && audit.pagespeed_mobile !== null) patch.pagespeed = audit.pagespeed_mobile;
  if (input.fields.includes('mobile') && audit.suggested_mobile && audit.suggested_mobile !== 'desconhecido') {
    patch.mobile = audit.suggested_mobile;
  }
  if (input.fields.includes('problems') && audit.suggested_problems) {
    patch.problems =
      input.problems_mode === 'append' ? appendProblems(lead.problems, audit.suggested_problems) : audit.suggested_problems;
  }
  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, 'Nada para aplicar', 'A análise não tem valores para os campos escolhidos.');
  }
  return updateLead(ctx, leadId, patch);
}
