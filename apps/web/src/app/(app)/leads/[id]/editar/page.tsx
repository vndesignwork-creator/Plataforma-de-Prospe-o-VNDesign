import type { Metadata } from 'next';
import { resolveLeadRoute } from '@/server/lead-route';
import { EditLead } from '@/components/leads/edit-lead';

export const metadata: Metadata = { title: 'Editar lead' };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ref } = await params;
  const id = await resolveLeadRoute(ref, { suffix: '/editar' });
  return <EditLead id={id} />;
}
