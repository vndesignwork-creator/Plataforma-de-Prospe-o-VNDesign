import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/layout/page-header';
import { ContactIssuesView } from '@/components/leads/contact-issues-view';

export const metadata: Metadata = { title: 'Contactos a corrigir' };

export default function ContactIssuesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: 'Leads', href: '/leads' }]} />}
        title="Contactos a corrigir"
        description="Emails que voltaram para trás ou de domínios que não recebem emails, telefones mal escritos e o mesmo telefone em leads diferentes. Abre o lead para corrigir."
      />
      <ContactIssuesView />
    </div>
  );
}
