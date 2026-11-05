import { apiRoute, json } from '@/server/http';
import { accountingPdf } from '@/server/reports/accounting-pdf';
import { accountingXlsx } from '@/server/reports/accounting-xlsx';
import { accountingReport } from '@/server/services/accounting';

export const runtime = 'nodejs';

/**
 * GET /api/v1/reports/accounting?month=AAAA-MM[&format=pdf|xlsx] — relatório do mês para a
 * contabilidade: recebido, despesas e por receber (JSON por omissão; PDF ou Excel para descarregar).
 */
export const GET = apiRoute(async (req, ctx) => {
  const url = new URL(req.url);
  const report = await accountingReport(ctx, url.searchParams.get('month') ?? '');
  const format = url.searchParams.get('format');
  if (format !== 'pdf' && format !== 'xlsx') return json({ data: report });
  const { data: sig } = await ctx.supabase.from('signatures').select('company, full_name').eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id).order('is_default', { ascending: false }).limit(1).maybeSingle();
  const { data: ws } = await ctx.supabase.from('workspaces').select('name').eq('id', ctx.workspaceId).maybeSingle();
  const brand = (sig?.company as string | null)?.trim() || (ws?.name as string | null)?.trim() || (sig?.full_name as string | null)?.trim() || 'VNDesign';
  const filename = `relatorio-${report.month}.${format}`;
  const content = format === 'pdf' ? await accountingPdf(report, brand) : await accountingXlsx(report, brand);
  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
