import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { TemplateLibrary } from '@/components/scripts/template-library';

export const metadata: Metadata = { title: 'Scripts' };

export default function ScriptsPage() {
  return (
    <>
      <PageHeader
        title="Scripts"
        description="Mensagens prontas que se preenchem com os dados de cada lead."
      />
      <TemplateLibrary />
    </>
  );
}
