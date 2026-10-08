import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { KanbanBoard } from '@/components/kanban/kanban-board';

export const metadata: Metadata = { title: 'Kanban' };

export default function KanbanPage() {
  return (
    <>
      <PageHeader title="Kanban" description="Pipeline por estado." />
      <KanbanBoard />
    </>
  );
}
