import type { Metadata } from 'next';
import { ProposalSettings } from '@/components/settings/proposal-settings';

export const metadata: Metadata = { title: 'Definições · Propostas e IA' };

export default function Page() {
  return <ProposalSettings />;
}
