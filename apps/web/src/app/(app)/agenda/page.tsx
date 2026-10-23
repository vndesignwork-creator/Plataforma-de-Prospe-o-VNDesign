import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { AgendaView } from '@/components/agenda/agenda-view';

export const metadata: Metadata = { title: 'Agenda' };

export default function AgendaPage() {
  return (
    <>
      <PageHeader
        title="Agenda"
        description="A semana: follow-ups, tarefas, reuniões, entregas e pagamentos. Arrasta (ou usa “Mudar o dia”) para passar uma tarefa, um follow-up ou uma entrega para outro dia."
      />
      <AgendaView />
    </>
  );
}
