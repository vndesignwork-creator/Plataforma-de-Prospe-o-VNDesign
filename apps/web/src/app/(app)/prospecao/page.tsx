import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { ProspectingSession } from '@/components/prospecting/prospecting-session';

export const metadata: Metadata = { title: 'Sessão de prospeção' };

export default function ProspectingPage() {
  return (
    <>
      <PageHeader
        title="Sessão de prospeção"
        description="Um lead de cada vez: contacta, regista o resultado com um toque e passa ao seguinte."
      />
      <ProspectingSession />
    </>
  );
}
