import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { LeadsTable } from '@/components/leads/leads-table';

export const metadata: Metadata = { title: 'Leads' };

export default function LeadsPage() {
  return (
    <>
      <PageHeader title="Pipeline de leads" description="Todos os leads de prospeção, com filtros e pesquisa." />
      <Suspense>
        <LeadsTable />
      </Suspense>
    </>
  );
}
