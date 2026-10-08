import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { TemplateLibrary } from '@/components/scripts/template-library';

export const metadata: Metadata = { title: 'Scripts de contacto' };

export default function ScriptsPage() {
  return (
    <>
      <PageHeader
        title="Scripts de contacto"
        description="Modelos com variáveis ({{empresa}}, {{contacto}}, {{assinatura}}…). Na ficha de cada lead aparecem já preenchidos."
      />
      <TemplateLibrary />
    </>
  );
}
