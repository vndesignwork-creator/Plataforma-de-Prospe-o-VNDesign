import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { ImportWizard } from '@/components/import/import-wizard';

export const metadata: Metadata = { title: 'Importar' };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <Link href="/leads" className="hover:text-fg hover:underline">
            Leads
          </Link>
        }
        title="Importar leads"
        description="CSV ou Excel — incluindo a tua folha “Leads_Prospeccao_VNDesign”. Os duplicados são detetados antes de gravar."
      />
      <ImportWizard />
    </div>
  );
}
