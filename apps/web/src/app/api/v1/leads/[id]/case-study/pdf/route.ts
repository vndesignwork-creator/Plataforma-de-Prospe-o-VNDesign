import { todayIso } from '@vndesign/core';
import { ApiError, apiRoute, parseId } from '@/server/http';
import { getCaseStudy } from '@/server/services/case-study';
import { getLead } from '@/server/services/leads';
import { getSignature } from '@/server/services/workspace';
import { renderCaseStudyPdf } from '@/server/reports/case-study-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /api/v1/leads/{id}/case-study/pdf — o caso de estudo em PDF (?download=1 para descarregar). */
export const GET = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const leadId = parseId(id);
  const [lead, study, signature] = await Promise.all([getLead(ctx, leadId), getCaseStudy(ctx, leadId), getSignature(ctx)]);
  if (!study) throw new ApiError(404, 'Sem caso de estudo', 'Escreve primeiro o caso de estudo na ficha do cliente.');
  const content = await renderCaseStudyPdf({
    study,
    company: lead.company_name,
    preparedBy: { name: signature.full_name, company: signature.company, website: signature.website, email: signature.email },
    today: todayIso(),
  });
  const slug = (study.anonymous ? 'caso-de-estudo' : `caso-de-estudo-${lead.company_name}`)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${slug}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
