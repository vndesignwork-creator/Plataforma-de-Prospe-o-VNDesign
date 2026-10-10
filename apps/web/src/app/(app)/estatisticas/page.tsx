import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { StatsView } from '@/components/dashboard/stats-view';

export const metadata: Metadata = { title: 'Estatísticas' };

export default function StatsPage() {
  return (
    <>
      <PageHeader title="Estatísticas" description="Os números da prospeção: funil, evolução, estados, setores, serviços e canais." />
      <StatsView />
    </>
  );
}
