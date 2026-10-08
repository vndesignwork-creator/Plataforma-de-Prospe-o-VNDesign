import type { Metadata } from 'next';
import { EditLead } from '@/components/leads/edit-lead';

export const metadata: Metadata = { title: 'Editar lead' };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditLead id={id} />;
}
