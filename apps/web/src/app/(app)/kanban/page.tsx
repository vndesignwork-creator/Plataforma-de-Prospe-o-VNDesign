import type { Metadata } from 'next';
import { Suspense } from 'react';
import { KanbanBoard } from '@/components/kanban/kanban-board';

export const metadata: Metadata = { title: 'Kanban' };

export default function KanbanPage() {
  return (
    // Computador: a página cabe no ecrã (sem scroll da página); o quadro fica com o resto da altura.
    <div className="lg:flex lg:h-[calc(100dvh-3.5rem)] lg:min-h-[32rem] lg:flex-col">
      {/* O cabeçalho está no quadro (mostra os números); os filtros vêm do endereço. */}
      <Suspense>
        <KanbanBoard />
      </Suspense>
    </div>
  );
}
