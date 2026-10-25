import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { ProspectingSession } from '@/components/prospecting/prospecting-session';

export const metadata: Metadata = { title: 'Sessão de prospeção' };

export default function ProspectingPage() {
  return (
    <>
      <PageHeader
        title="Sessão de prospeção"
        description="Os contactos do dia, por email ou por telefone: envia ou regista com um toque, sem sair do sítio."
      />
      <ProspectingSession />
    </>
  );
}
