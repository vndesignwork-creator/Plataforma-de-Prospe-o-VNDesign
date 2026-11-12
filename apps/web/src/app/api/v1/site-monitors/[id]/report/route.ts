import { monthLabel, monthUtcRange, todayIso } from '@vndesign/core';
import { ApiError, apiRoute, parseId } from '@/server/http';
import { siteReportPdf } from '@/server/reports/site-report-pdf';
import { getLead } from '@/server/services/leads';
import { getSiteMonitor, siteMonitorHistory } from '@/server/services/site-monitors';
import { displayHost } from '@/lib/utils';

export const runtime = 'nodejs';

type Params = { id: string };

/** GET /api/v1/site-monitors/{id}/report?month=AAAA-MM — relatório do mês em PDF, para enviar ao cliente. */
export const GET = apiRoute<Params>(async (req, ctx, { id }) => {
  const month = new URL(req.url).searchParams.get('month') ?? todayIso().slice(0, 7);
  const range = monthUtcRange(month);
  if (!range || range.from.getTime() > Date.now()) throw new ApiError(400, 'Mês inválido', 'Usa month=AAAA-MM (este mês ou um anterior).');
  const history = await siteMonitorHistory(ctx, parseId(id, 'Vigilância do site não encontrada'), range.from, range.to);
  const [lead, monitor] = await Promise.all([getLead(ctx, history.lead_id), getSiteMonitor(ctx, history.lead_id)]);
  const { data: sig } = await ctx.supabase.from('signatures').select('company, full_name').eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id).order('is_default', { ascending: false }).limit(1).maybeSingle();
  const { data: ws } = await ctx.supabase.from('workspaces').select('name').eq('id', ctx.workspaceId).maybeSingle();
  const brand = (sig?.company as string | null)?.trim() || (ws?.name as string | null)?.trim() || (sig?.full_name as string | null)?.trim() || 'VNDesign';
  const host = displayHost(history.url);
  const pdf = await siteReportPdf({
    brand,
    client: lead.company_name,
    host,
    monthLabel: monthLabel(month),
    uptime: history,
    ssl_until: monitor?.ssl_expires_at?.slice(0, 10) ?? null,
    domain_until: monitor?.domain_renewal_on ?? monitor?.domain_expires_on ?? null,
  });
  const safeHost = host.replace(/[^a-z0-9.-]+/gi, '-');
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-site-${safeHost}-${month}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
