import type { Metadata } from 'next';
import { resolveLeadRoute } from '@/server/lead-route';
import { LeadDetail } from '@/components/leads/lead-detail';

export const metadata: Metadata = { title: 'Ficha do lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ref } = await params;
  const id = await resolveLeadRoute(ref);
  return <LeadDetail id={id} />;
}
