import type { Metadata } from 'next';
import { LeadDetail } from '@/components/leads/lead-detail';

export const metadata: Metadata = { title: 'Ficha do lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetail id={id} />;
}
