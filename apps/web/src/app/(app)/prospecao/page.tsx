import type { Metadata } from 'next';
import { ProspectingSession } from '@/components/prospecting/prospecting-session';

export const metadata: Metadata = { title: 'Prospeção' };

export default function ProspectingPage() {
  return <ProspectingSession />;
}
