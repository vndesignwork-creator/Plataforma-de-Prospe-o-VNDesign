import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { MyTasksView } from '@/components/tasks/my-tasks-view';

export const metadata: Metadata = { title: 'Tarefas' };

export default function TarefasPage() {
  return (
    <Suspense fallback={<PageHeader title="Tarefas" />}>
      <MyTasksView />
    </Suspense>
  );
}
