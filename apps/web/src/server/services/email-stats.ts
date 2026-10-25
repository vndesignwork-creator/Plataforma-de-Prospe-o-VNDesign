/**
 * Estatísticas → Emails: abertura, clique e resposta por modelo e quando os
 * emails são abertos (dos emails enviados pela plataforma nos últimos N dias).
 */
import { bestSlots, openHeatmap, statsByTemplate, type EmailStats } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';

const LIMIT = 5000;

export async function emailStats(ctx: ApiContext, days: number): Promise<EmailStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [sentRes, repliesRes, openedRes] = await Promise.all([
    ctx.supabase
      .from('lead_activities')
      .select('lead_id, created_at, template:payload->>template, tracking_id:payload->>tracking_id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'email_sent')
      .eq('payload->>via', 'platform')
      .gte('created_at', since)
      .order('created_at')
      .limit(LIMIT),
    ctx.supabase
      .from('lead_activities')
      .select('lead_id, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'email_received')
      .is('payload->>auto', null)
      .gte('created_at', since)
      .limit(LIMIT),
    ctx.supabase
      .from('email_tracking')
      .select('id, opens, clicks, first_opened_at')
      .eq('workspace_id', ctx.workspaceId)
      .gte('sent_at', since)
      .limit(LIMIT),
  ]);
  for (const r of [sentRes, repliesRes, openedRes]) if (r.error) throw fromPostgrest(r.error);

  type Sent = { lead_id: string; created_at: string; template: string | null; tracking_id: string | null };
  type Tracked = { id: string; opens: number; clicks: number; first_opened_at: string | null };
  const tracked = (openedRes.data ?? []) as Tracked[];
  const tracking = new Map(tracked.map((t) => [t.id, { opens: t.opens, clicks: t.clicks }]));
  const heatmap = openHeatmap(tracked.filter((t) => t.first_opened_at).map((t) => t.first_opened_at!));
  return {
    days,
    tracked: tracked.length > 0,
    templates: statsByTemplate(
      ((sentRes.data ?? []) as Sent[]).map((s) => ({ lead_id: s.lead_id, at: s.created_at, template: s.template, tracking_id: s.tracking_id })),
      tracking,
      ((repliesRes.data ?? []) as { lead_id: string; created_at: string }[]).map((r) => ({ lead_id: r.lead_id, at: r.created_at })),
    ),
    heatmap,
    best: bestSlots(heatmap),
  };
}
