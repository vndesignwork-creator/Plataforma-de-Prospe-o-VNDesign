import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ShareToLead } from '@/components/share/share-to-lead';

export const metadata: Metadata = { title: 'Novo lead partilhado' };

/** Destino do "Partilhar → VNDesign Leads" (Android) e de um link colado à mão. */
export default function SharePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: 'Leads', href: '/leads' }]} />}
        title="Novo lead a partir de um link"
        description="Do Google Maps, do Instagram, do Facebook ou do site da empresa."
      />
      <Suspense>
        <ShareToLead />
      </Suspense>
    </div>
  );
}
