import type { Metadata } from 'next';
import { CollaboratorsView } from '@/components/collaborators/collaborators-view';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'Colaboradores' };

export default function CollaboratorsPage() {
  return (
    <>
      <PageHeader title="Colaboradores" description="Quem convidaste para os projetos: estado do convite, horas registadas e os projetos de cada um." />
      <CollaboratorsView />
    </>
  );
}
