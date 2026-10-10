import type { Metadata } from 'next';
import { resolveLeadRoute } from '@/server/lead-route';
import { ProposalEditor } from '@/components/proposals/proposal-editor';

export const metadata: Metadata = { title: 'Nova proposta' };

export default async function NewProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ref } = await params;
  const id = await resolveLeadRoute(ref, { suffix: '/propostas/nova' });
  return <ProposalEditor leadId={id} proposalId={null} />;
}
