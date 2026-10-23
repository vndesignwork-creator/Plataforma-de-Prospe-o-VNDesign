import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/layout/page-header';
import { DuplicatesView } from '@/components/leads/duplicates-view';

export const metadata: Metadata = { title: 'Limpar duplicados' };

export default function DuplicatesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: 'Leads', href: '/leads' }]} />}
        title="Limpar duplicados"
        description="Leads com o mesmo email, o mesmo site ou o mesmo nome. Junta-os no principal (nada se perde) ou marca que não são duplicados."
      />
      <DuplicatesView />
    </div>
  );
}
