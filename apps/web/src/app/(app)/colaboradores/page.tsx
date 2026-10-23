import { redirect } from 'next/navigation';

/** Os colaboradores passaram para Equipa → Projetos (links antigos continuam a funcionar). */
export default function CollaboratorsPage() {
  redirect('/equipa?ver=projetos');
}
