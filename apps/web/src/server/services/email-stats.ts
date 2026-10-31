/**
 * Estatísticas → Emails: abertura, clique e resposta por modelo e quando os
 * emails são abertos (dos emails enviados pela plataforma nos últimos N dias).
 */
import { bestSlots, openHeatmap, statsByTemplate, type EmailStats } from '@vndesign/core';
import type { ApiContext } from '../context';
import { selectAllPages } from '../batch';

type Sent = { lead_id: string; created_at: string; template: string | null; tracking_id: string | null };
type Tracked = { id: string; opens: number; clicks: number; first_opened_at: string | null };

export async function emailStats(ctx: ApiContext, days: number): Promise<EmailStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  // Página a página (o Supabase devolve no máximo 1000 linhas por pedido).
  const [sent, replies, tracked] = await Promise.all([
    selectAllPages<Sent>((from, to) =>
      ctx.supabase
        .from('lead_activities')
        .select('lead_id, created_at, template:payload->>template, tracking_id:payload->>tracking_id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('type', 'email_sent')
        .eq('payload->>via', 'platform')
        .gte('created_at', since)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
    selectAllPages<{ lead_id: string; created_at: string }>((from, to) =>
      ctx.supabase
        .from('lead_activities')
        .select('lead_id, created_at')
        .eq('workspace_id', ctx.workspaceId)
        .eq('type', 'email_received')
        .is('payload->>auto', null)
        .gte('created_at', since)
        .order('id')
        .range(from, to),
    ),
    selectAllPages<Tracked>((from, to) =>
      ctx.supabase
        .from('email_tracking')
        .select('id, opens, clicks, first_opened_at')
        .eq('workspace_id', ctx.workspaceId)
        .gte('sent_at', since)
        .order('id')
        .range(from, to),
    ),
  ]);

  const tracking = new Map(tracked.map((t) => [t.id, { opens: t.opens, clicks: t.clicks }]));
  const heatmap = openHeatmap(tracked.filter((t) => t.first_opened_at).map((t) => t.first_opened_at!));
  return {
    days,
    tracked: tracked.length > 0,
    templates: statsByTemplate(
      sent.map((s) => ({ lead_id: s.lead_id, at: s.created_at, template: s.template, tracking_id: s.tracking_id })),
      tracking,
      replies.map((r) => ({ lead_id: r.lead_id, at: r.created_at })),
    ),
    heatmap,
    best: bestSlots(heatmap),
  };
}
