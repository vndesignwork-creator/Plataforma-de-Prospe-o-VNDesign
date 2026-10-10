import type { Metadata } from 'next';
import { resolveLeadRoute } from '@/server/lead-route';
import { ProposalEditor } from '@/components/proposals/proposal-editor';

export const metadata: Metadata = { title: 'Proposta' };

export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id: ref, proposalId } = await params;
  const id = await resolveLeadRoute(ref, { suffix: `/propostas/${proposalId}` });
  return <ProposalEditor leadId={id} proposalId={proposalId} />;
}
