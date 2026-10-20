import type { Metadata } from 'next';
import { ProposalSettings } from '@/components/settings/proposal-settings';

export const metadata: Metadata = { title: 'Definições · Propostas' };

export default function Page() {
  return <ProposalSettings />;
}
