/**
 * Leads que visitam o teu site: quando um lead carrega num link de um email
 * teu, o endereço leva um código (`vnd`). O plugin de WordPress guarda-o no
 * browser dele e avisa a plataforma em cada visita ao teu site — ficas a saber
 * que está morno antes de ligar.
 *
 * Só funciona com quem já clicou num email teu (não identifica estranhos nem
 * guarda nada de quem nunca foi contactado).
 */
import { WorkspaceSettingsSchema, leadPath } from '@vndesign/core';
import { createSupabaseAdminClient } from '../supabase-admin';
import { alertUser } from './push';

/** Entre visitas registadas do mesmo lead (nem todas as páginas viram registo). */
const VISIT_GAP_MS = 30 * 60_000;
/** Entre avisos do mesmo lead. */
const ALERT_GAP_MS = 6 * 3_600_000;

const recent = new Map<string, number>();

/** Guarda só o caminho da página ("/precos"), sem o resto do endereço. */
export function visitPath(page: string): string | null {
  try {
    const url = new URL(page);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.pathname}${url.search}`.slice(0, 300);
  } catch {
    return null;
  }
}

/** O site de onde veio o aviso (host), para a atividade. */
export function visitHost(page: string): string | null {
  try {
    return new URL(page).hostname.replace(/^www\./, '').slice(0, 120) || null;
  } catch {
    return null;
  }
}

export interface VisitInput {
  /** Código do email (o mesmo do rastreio de aberturas e cliques). */
  lead: string;
  page: string;
  referrer?: string | null;
}

/**
 * Regista a visita (uma por lead a cada 30 minutos) e avisa quem enviou o
 * email, no máximo de 6 em 6 horas. Devolve false quando não há nada a fazer
 * (código inválido, funcionalidade desligada, visita repetida).
 */
export async function recordSiteVisit(siteToken: string, input: VisitInput): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(siteToken) || !/^[A-Za-z0-9_-]{16,64}$/.test(input.lead)) return false;
  const path = visitPath(input.page);
  if (!path) return false;

  const admin = createSupabaseAdminClient();
  const { data: tracking } = await admin
    .from('email_tracking')
    .select('id, workspace_id, lead_id, subject, created_by')
    .eq('token', input.lead)
    .maybeSingle();
  if (!tracking) return false;
  const row = tracking as { id: string; workspace_id: string; lead_id: string; subject: string; created_by: string | null };

  // O código do site tem de ser do mesmo workspace do email (senão não se regista nada).
  const { data: workspace } = await admin.from('workspaces').select('id, settings').eq('id', row.workspace_id).maybeSingle();
  if (!workspace) return false;
  const settings = WorkspaceSettingsSchema.parse(workspace.settings ?? {});
  if (!settings.features.site_visits) return false;
  if (settings.free_audit.token !== siteToken) return false;

  const now = Date.now();
  const last = recent.get(row.lead_id) ?? 0;
  if (now - last < VISIT_GAP_MS) return false;
  if (recent.size > 20_000) recent.clear();
  recent.set(row.lead_id, now);

  const { data: lead } = await admin
    .from('leads')
    .select('id, number, company_name, anonymized_at, archived_at')
    .eq('workspace_id', row.workspace_id)
    .eq('id', row.lead_id)
    .maybeSingle();
  if (!lead || lead.anonymized_at || lead.archived_at) return false;

  await admin.from('lead_activities').insert({
    workspace_id: row.workspace_id,
    lead_id: row.lead_id,
    type: 'site_visit',
    body: path,
    payload: {
      page: path,
      site: visitHost(input.page),
      from_email: row.subject,
      ...(input.referrer ? { referrer: String(input.referrer).slice(0, 300) } : {}),
    },
  });

  // Aviso: no máximo um por lead a cada 6 horas (a última atividade do mesmo tipo diz quando foi).
  if (row.created_by) {
    const since = new Date(now - ALERT_GAP_MS).toISOString();
    const { count } = await admin
      .from('lead_activities')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', row.workspace_id)
      .eq('lead_id', row.lead_id)
      .eq('type', 'site_visit')
      .gte('created_at', since);
    if ((count ?? 0) <= 1) {
      await alertUser(row.workspace_id, row.created_by, {
        kind: 'email_open',
        leadId: row.lead_id,
        title: `👀 ${lead.company_name as string} está no teu site`,
        body: `Depois do email “${row.subject}”, foi ver ${path}. Bom momento para ligar!`,
        url: leadPath(lead as { id: string; number: number; company_name: string }),
        tag: `visit-${row.lead_id}`,
      }).catch(() => undefined);
    }
  }
  return true;
}
