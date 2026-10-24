import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { KanbanBoard } from '@/components/kanban/kanban-board';

export const metadata: Metadata = { title: 'Kanban' };

export default function KanbanPage() {
  return (
    // Computador: a página cabe no ecrã (sem scroll da página); o quadro fica com o resto da altura.
    <div className="lg:flex lg:h-[calc(100dvh-3.5rem)] lg:min-h-[32rem] lg:flex-col">
      <PageHeader title="Kanban" description="Pipeline por estado." />
      <KanbanBoard />
    </div>
  );
}
