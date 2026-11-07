import type { Metadata } from 'next';
import { TrashView } from '@/components/leads/trash-view';
import { Card, CardHeader } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Definições · Apagados' };

/** A reciclagem também nas Definições (a mesma de Leads → Apagados). */
export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Apagados (reciclagem)"
          description="Os leads e os projetos apagados ficam aqui 30 dias, com tudo o que tinham (tarefas, pagamentos, reuniões, horas, propostas). Repor volta a pô-los como estavam."
        />
      </Card>
      <TrashView />
    </div>
  );
}
