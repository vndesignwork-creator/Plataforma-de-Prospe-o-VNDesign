import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { LeadGenerator } from '@/components/lead-generation/lead-generator';

export const metadata: Metadata = { title: 'Gerar leads' };

export default function GenerateLeadsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Gerar leads"
        description="Descreve que empresas procuras e o Claude pesquisa na internet. Tu escolhes quais entram como leads."
      />
      <LeadGenerator />
    </div>
  );
}
