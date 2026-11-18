import type { Metadata } from 'next';
import { ClientsAndProjects } from '@/components/projects/clients-projects-tabs';

export const metadata: Metadata = { title: 'Projetos' };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  // O cabeçalho está em cada vista (mostra os números dos clientes ou dos projetos).
  return <ClientsAndProjects initialTab={ver === 'clientes' ? 'clientes' : 'projetos'} />;
}
