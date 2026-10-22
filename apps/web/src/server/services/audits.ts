/**
 * Auditorias de sites guardadas por lead (histórico), "Aplicar ao lead"
 * (PageSpeed, Mobile? e Problemas) e as imagens do site (telemóvel e computador,
 * tiradas pelo PageSpeed e guardadas no bucket privado "site-screenshots").
 */
import { ensureUrlProtocol, type AuditApply, type Lead, type LeadUpdate, type ScreenshotDevice, type SiteAudit } from '@vndesign/core';
import { isPageSpeedEnabled, runPageSpeed, type PageSpeedOutcome, type PageSpeedShot } from '../audit/pagespeed';
import { collectAudit } from '../audit/run-audit';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead, updateLead } from './leads';
import { getSettings } from './workspace';

const BUCKET = 'site-screenshots';
type StoredShot = { device: ScreenshotDevice; path: string; width: number | null; height: number | null };
type AuditRow = Omit<SiteAudit, 'screenshots'> & { screenshots: StoredShot[] | null };

/** As imagens guardadas passam a links da API (o caminho no Storage não sai do servidor). */
function toAudit(row: AuditRow): SiteAudit {
  return {
    ...row,
    screenshots: (row.screenshots ?? []).map((s) => ({
      device: s.device,
      width: s.width,
      height: s.height,
      url: `/api/v1/leads/${row.lead_id}/audits/${row.id}/screenshots/${s.device}`,
    })),
  };
}

const AUDIT_SELECT = [
  'id', 'lead_id', 'url', 'final_url', 'status', 'http_status', 'response_ms', 'https', 'ssl_valid',
  'ssl_issuer', 'ssl_expires_at', 'ssl_error', 'has_viewport', 'zoom_blocked', 'pagespeed_mobile',
  'metrics', 'title', 'meta_description', 'cms', 'copyright_year', 'issues', 'suggested_problems',
  'suggested_mobile', 'error', 'screenshots', 'created_at',
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
  return ((data ?? []) as unknown as AuditRow[]).map(toAudit);
}

export async function runLeadAudit(ctx: ApiContext, leadId: string, url?: string): Promise<SiteAudit> {
  const lead = await getLead(ctx, leadId);
  const target = url?.trim() || lead.website;
  if (!target) {
    throw new ApiError(422, 'Sem website', 'Este lead não tem website. Indica o endereço a analisar.');
  }

  // A imagem no computador pede-se ao mesmo tempo (a do telemóvel vem com a pontuação).
  const shots = (await getSettings(ctx)).features.site_screenshots && isPageSpeedEnabled();
  const desktop = shots ? runPageSpeed(ensureUrlProtocol(target.trim()), 55_000, 'desktop') : null;
  const { record, mobileShot } = await collectAudit(target);
  // Endereço inválido ou interno: erro do pedido (não fica no histórico).
  if (record.status === 'error') throw new ApiError(422, 'Não é possível analisar', record.error ?? undefined);
  const result = await ctx.supabase
    .from('site_audits')
    .insert({ ...record, workspace_id: ctx.workspaceId, lead_id: leadId, created_by: ctx.user.id })
    .select(AUDIT_SELECT)
    .single();
  let audit = toAudit(unwrap(result) as unknown as AuditRow);
  if (shots && record.final_url) {
    const desktopOutcome = await desktop;
    const stored = await storeShots(ctx, leadId, audit.id, {
      mobile: mobileShot,
      desktop: desktopOutcome?.ok ? desktopOutcome.screenshot : null,
    }).catch(() => null);
    if (stored) audit = stored;
  }

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
  return toAudit(unwrap(result, NOT_FOUND) as unknown as AuditRow);
}

// -----------------------------------------------------------------------------
// Imagens do site
// -----------------------------------------------------------------------------

function decodeShot(shot: PageSpeedShot): { buffer: Buffer; type: string; ext: string } | null {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/s.exec(shot.data);
  if (!m) return null;
  return { buffer: Buffer.from(m[3], 'base64'), type: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2] };
}

/** Guarda as imagens recebidas (substitui as do mesmo aparelho) e devolve a análise atualizada. */
async function storeShots(
  ctx: ApiContext,
  leadId: string,
  auditId: string,
  shots: Partial<Record<ScreenshotDevice, PageSpeedShot | null>>,
): Promise<SiteAudit | null> {
  const admin = createSupabaseAdminClient();
  const current = await getAudit(ctx, leadId, auditId);
  const { data: row } = await ctx.supabase.from('site_audits').select('screenshots').eq('id', auditId).maybeSingle();
  const stored = new Map<ScreenshotDevice, StoredShot>(((row?.screenshots ?? []) as StoredShot[]).map((s) => [s.device, s]));
  let changed = false;
  for (const device of ['mobile', 'desktop'] as const) {
    const shot = shots[device];
    const file = shot ? decodeShot(shot) : null;
    if (!shot || !file) continue;
    const path = `${ctx.workspaceId}/${leadId}/${auditId}-${device}.${file.ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, file.buffer, { contentType: file.type, upsert: true });
    if (error) continue;
    stored.set(device, { device, path, width: shot.width, height: shot.height });
    changed = true;
  }
  if (!changed) return null;
  const list = [...stored.values()].sort((a, b) => (a.device === 'mobile' ? -1 : b.device === 'mobile' ? 1 : 0));
  const { error } = await ctx.supabase.from('site_audits').update({ screenshots: list }).eq('id', auditId).eq('workspace_id', ctx.workspaceId);
  if (error) throw fromPostgrest(error);
  return toAudit({ ...current, screenshots: list } as AuditRow);
}

/** A análise mais recente que chegou ao site (para as imagens, o relatório e o email). */
async function latestReachableAudit(ctx: ApiContext, leadId: string): Promise<SiteAudit | null> {
  const audits = await listAudits(ctx, leadId);
  return audits.find((a) => a.status === 'done' && a.final_url) ?? null;
}

/** "Tirar imagens": pede ao PageSpeed o site no telemóvel e no computador (para a última análise). */
export async function captureScreenshots(ctx: ApiContext, leadId: string): Promise<SiteAudit> {
  const audit = await latestReachableAudit(ctx, leadId);
  if (!audit) throw new ApiError(422, 'Sem análise do site', 'Analisa primeiro o site do lead.');
  const url = audit.final_url ?? audit.url;
  const [mobile, desktop] = await Promise.all([runPageSpeed(url, 55_000, 'mobile'), runPageSpeed(url, 55_000, 'desktop')]);
  const shot = (o: PageSpeedOutcome) => (o.ok ? o.screenshot : null);
  const updated = await storeShots(ctx, leadId, audit.id, { mobile: shot(mobile), desktop: shot(desktop) });
  if (!updated) {
    const reason = !mobile.ok ? mobile.error : !desktop.ok ? desktop.error : 'O PageSpeed não devolveu imagens deste site.';
    throw new ApiError(502, 'Sem imagens', reason);
  }
  return updated;
}

/** Link temporário (10 minutos) para uma imagem. */
export async function screenshotUrl(ctx: ApiContext, leadId: string, auditId: string, device: ScreenshotDevice): Promise<string> {
  const { data: row, error } = await ctx.supabase
    .from('site_audits')
    .select('screenshots')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .eq('id', auditId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  const shot = ((row?.screenshots ?? []) as StoredShot[]).find((s) => s.device === device);
  if (!shot) throw new ApiError(404, 'Imagem não encontrada');
  const { data, error: signError } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(shot.path, 600);
  if (signError || !data) throw new ApiError(502, 'Imagem indisponível', 'Não foi possível abrir a imagem. Tenta outra vez.');
  return data.signedUrl;
}

/** As imagens mais recentes do site do lead (para o relatório PDF e o email). */
export async function latestScreenshots(
  ctx: ApiContext,
  leadId: string,
): Promise<{ device: ScreenshotDevice; buffer: Buffer; filename: string; contentType: string; width: number | null; height: number | null }[]> {
  const { data, error } = await ctx.supabase
    .from('site_audits')
    .select('screenshots, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .neq('screenshots', '[]')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  const shots = (data?.screenshots ?? []) as StoredShot[];
  const admin = createSupabaseAdminClient();
  const files = await Promise.all(
    shots.map(async (s) => {
      const { data: blob } = await admin.storage.from(BUCKET).download(s.path);
      if (!blob) return null;
      const ext = s.path.split('.').pop() ?? 'jpg';
      return {
        device: s.device,
        width: s.width,
        height: s.height,
        buffer: Buffer.from(await blob.arrayBuffer()),
        filename: `site-${s.device === 'mobile' ? 'telemovel' : 'computador'}.${ext}`,
        contentType: blob.type || (ext === 'png' ? 'image/png' : 'image/jpeg'),
      };
    }),
  );
  return files.filter((f) => f !== null);
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
