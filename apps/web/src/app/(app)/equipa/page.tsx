import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { TeamView } from '@/components/team/team-view';

export const metadata: Metadata = { title: 'Equipa' };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  return (
    <>
      <PageHeader title="Equipa" description="Quem trabalha contigo: a equipa de prospeção (com conta na plataforma) e os colaboradores dos projetos." />
      <TeamView initialTab={ver === 'projetos' ? 'projetos' : 'prospecao'} />
    </>
  );
}
