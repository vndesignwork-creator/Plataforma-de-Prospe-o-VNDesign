import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { LeadForm } from '@/components/leads/lead-form';

export const metadata: Metadata = { title: 'Novo lead' };

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <Link href="/leads" className="hover:text-fg hover:underline">
            Leads
          </Link>
        }
        title="Novo lead"
        description="Enquanto escreves o nome, o website ou o email, verificamos se o lead já existe."
      />
      <LeadForm />
    </div>
  );
}
