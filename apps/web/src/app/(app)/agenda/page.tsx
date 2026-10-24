import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { AgendaView } from '@/components/agenda/agenda-view';

export const metadata: Metadata = { title: 'Agenda' };

export default function AgendaPage() {
  return (
    <>
      <PageHeader
        title="Agenda"
        description="A semana dos compromissos: reuniões, entregas, pagamentos e tarefas. Os follow-ups aparecem como um número por dia (fazem-se na Prospeção); arrasta ou usa “Mudar o dia” para passar algo para outro dia."
      />
      <AgendaView />
    </>
  );
}
