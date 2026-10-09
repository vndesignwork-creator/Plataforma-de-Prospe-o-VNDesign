import type { Metadata } from 'next';
import { ProposalEditor } from '@/components/proposals/proposal-editor';

export const metadata: Metadata = { title: 'Nova proposta' };

export default async function NewProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalEditor leadId={id} proposalId={null} />;
}
