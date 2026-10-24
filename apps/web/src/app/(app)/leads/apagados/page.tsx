import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/layout/page-header';
import { TrashView } from '@/components/leads/trash-view';

export const metadata: Metadata = { title: 'Apagados' };

export default function TrashPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: 'Leads', href: '/leads' }]} />}
        title="Apagados"
        description="Os leads apagados ficam aqui 30 dias, com tudo o que tinham (tarefas, pagamentos, reuniões, horas, propostas, linha do tempo). Repor volta a pô-los como estavam."
      />
      <TrashView />
    </div>
  );
}
