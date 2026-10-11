import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { LeadForm } from '@/components/leads/lead-form';

export const metadata: Metadata = { title: 'Novo lead' };

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: 'Leads', href: '/leads' }]} />}
        title="Novo lead"
        description="Enquanto escreves o nome, o website ou o email, verificamos se o lead já existe."
      />
      <LeadForm />
    </div>
  );
}
