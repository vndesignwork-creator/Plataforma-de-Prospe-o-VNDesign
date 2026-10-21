import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { ProjectsView } from '@/components/projects/projects-view';

export const metadata: Metadata = { title: 'Projetos' };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="Projetos" description="Os clientes com o projeto em curso: tarefas, pagamentos e próxima reunião." />
      <ProjectsView />
    </>
  );
}
