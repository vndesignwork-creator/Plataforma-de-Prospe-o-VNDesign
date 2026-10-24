import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { LeadsTable } from '@/components/leads/leads-table';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Leads' };

export default function LeadsPage() {
  return (
    // Computador: a página cabe no ecrã; a tabela fica com o resto da altura (scroll e barra horizontal dentro dela).
    <div className="lg:flex lg:h-[calc(100dvh-3.5rem)] lg:min-h-[32rem] lg:flex-col">
      <PageHeader
        title="Pipeline de leads"
        description="Todos os leads de prospeção, com filtros e pesquisa."
        actionsClassName="ml-auto"
        actions={
          <Link href="/leads/novo" className={buttonClasses('primary')}>
            <Plus className="h-4 w-4" aria-hidden />
            Novo lead
          </Link>
        }
      />
      <Suspense>
        <LeadsTable />
      </Suspense>
    </div>
  );
}
