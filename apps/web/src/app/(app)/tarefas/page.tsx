import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { MyTasksView } from '@/components/tasks/my-tasks-view';

export const metadata: Metadata = { title: 'Tarefas' };

export default function TarefasPage() {
  return (
    <>
      <PageHeader
        title="Tarefas"
        description="As tarefas por fazer de todos os leads e projetos, pelo prazo. Marca a caixa quando estiver feita."
      />
      <Suspense>
        <MyTasksView />
      </Suspense>
    </>
  );
}
