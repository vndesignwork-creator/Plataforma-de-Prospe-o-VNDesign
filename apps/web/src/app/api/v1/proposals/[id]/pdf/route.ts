import { slugify } from '@vndesign/core';
import { apiRoute, parseId } from '@/server/http';
import { renderProposalPdf } from '@/server/proposals/pdf';
import { getLead } from '@/server/services/leads';
import { getProposal } from '@/server/services/proposals';
import { getSettings, getSignature } from '@/server/services/workspace';

export const runtime = 'nodejs';

/** GET /api/v1/proposals/{id}/pdf — PDF da proposta (?download=1 para descarregar). */
export const GET = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const proposal = await getProposal(ctx, parseId(id, 'Documento'));
  const [lead, signature, settings] = await Promise.all([getLead(ctx, proposal.lead_id), getSignature(ctx), getSettings(ctx)]);
  const pdf = await renderProposalPdf({ proposal, lead, signature, settings: settings.proposal });
  const filename = `Proposta-${proposal.code}-${slugify(lead.company_name) || 'cliente'}.pdf`;
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
