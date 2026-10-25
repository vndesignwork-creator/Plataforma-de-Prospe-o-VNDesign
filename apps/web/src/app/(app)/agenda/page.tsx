import { redirect } from 'next/navigation';

/** A Agenda foi retirada (os follow-ups fazem-se na Prospeção e no Hoje; o resto está no calendário dos Projetos). */
export default function AgendaPage() {
  redirect('/dashboard');
}
