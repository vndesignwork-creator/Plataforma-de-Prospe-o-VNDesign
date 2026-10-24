import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { ProspectingSession } from '@/components/prospecting/prospecting-session';

export const metadata: Metadata = { title: 'Sessão de prospeção' };

export default function ProspectingPage() {
  return (
    <>
      <PageHeader
        title="Sessão de prospeção"
        description="A lista de chamadas do dia: contacta e regista o resultado com um toque, sem sair do sítio."
      />
      <ProspectingSession />
    </>
  );
}
