/**
 * Propostas a expirar: uma vez por dia, avisa quem trata do lead quando uma
 * proposta enviada está a dias de perder a validade e, depois, quando já
 * passou. Cada proposta avisa no máximo duas vezes (antes e depois).
 */
import {
  WorkspaceSettingsSchema,
  leadPath,
  proposalCode,
  proposalExpiry,
  proposalExpiryAlert,
  todayIso,
  PROPOSAL_EXPIRY_WARN_DAYS,
} from '@vndesign/core';
import { createSupabaseAdminClient } from '../supabase-admin';
import { saveAlert } from './push';

type Row = {
  id: string;
  workspace_id: string;
  lead_id: string;
  number: number;
  status: string;
  valid_until: string;
  created_at: string;
  expiry_alert_on: string | null;
  lead: { id: string; number: number; company_name: string; status: string; assigned_to: string | null; created_by: string | null; archived_at: string | null; anonymized_at: string | null } | null;
};

export async function runProposalExpiryAlerts(options: { dryRun?: boolean; now?: Date } = {}): Promise<{ due: number; alerts: number }> {
  const admin = createSupabaseAdminClient();
  const today = todayIso(options.now ?? new Date());
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + PROPOSAL_EXPIRY_WARN_DAYS);
  const until = limit.toISOString().slice(0, 10);
  // Propostas enviadas com a validade à vista (ou já passada nos últimos 30 dias).
  const floor = new Date(`${today}T12:00:00Z`);
  floor.setUTCDate(floor.getUTCDate() - 30);

  const { data, error } = await admin
    .from('proposals')
    .select(
      'id, workspace_id, lead_id, number, status, valid_until, created_at, expiry_alert_on, lead:leads!inner(id, number, company_name, status, assigned_to, created_by, archived_at, anonymized_at)',
    )
    .eq('status', 'enviada')
    .not('valid_until', 'is', null)
    .gte('valid_until', floor.toISOString().slice(0, 10))
    .lte('valid_until', until)
    .limit(1000);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.lead && !r.lead.archived_at && !r.lead.anonymized_at);

  // Só nos workspaces com a funcionalidade ligada.
  const workspaceIds = [...new Set(rows.map((r) => r.workspace_id))];
  if (!workspaceIds.length) return { due: 0, alerts: 0 };
  const { data: workspaces } = await admin.from('workspaces').select('id, settings').in('id', workspaceIds);
  const enabled = new Set(
    ((workspaces ?? []) as { id: string; settings: unknown }[])
      .filter((w) => WorkspaceSettingsSchema.parse(w.settings ?? {}).features.proposal_expiry)
      .map((w) => w.id),
  );

  const todo = rows
    .map((row) => ({ row, expiry: proposalExpiry(row, today) }))
    .filter((r): r is { row: Row; expiry: NonNullable<ReturnType<typeof proposalExpiry>> } => !!r.expiry)
    .filter(({ row, expiry }) => {
      if (!enabled.has(row.workspace_id)) return false;
      // Antes de terminar: só o primeiro aviso. Depois de terminar: só se o
      // aviso anterior foi antes do fim da validade.
      if (!row.expiry_alert_on) return true;
      return expiry.state === 'expirada' && row.expiry_alert_on <= expiry.on;
    });
  if (options.dryRun) return { due: todo.length, alerts: 0 };

  let alerts = 0;
  for (const { row, expiry } of todo) {
    const lead = row.lead!;
    const userId = lead.assigned_to ?? lead.created_by;
    const { error: markError } = await admin
      .from('proposals')
      .update({ expiry_alert_on: today })
      .eq('workspace_id', row.workspace_id)
      .eq('id', row.id);
    if (markError) {
      console.warn('[propostas] marcar o aviso', markError.message);
      continue;
    }
    if (!userId) continue;
    const { title, body } = proposalExpiryAlert(expiry, lead.company_name, proposalCode(row.number, row.created_at));
    const saved = await saveAlert(row.workspace_id, userId, {
      kind: 'daily',
      leadId: lead.id,
      title,
      body,
      url: `${leadPath(lead)}#propostas`,
      tag: `proposal-expiry-${row.id}-${expiry.state}`,
    }).catch(() => false);
    if (saved) alerts++;
  }
  return { due: todo.length, alerts };
}
