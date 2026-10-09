import type { Metadata } from 'next';
import { ProposalEditor } from '@/components/proposals/proposal-editor';

export const metadata: Metadata = { title: 'Proposta' };

export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params;
  return <ProposalEditor leadId={id} proposalId={proposalId} />;
}
