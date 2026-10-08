import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { AccountSettings } from '@/components/settings/account-settings';
import { DoNotContactSettings } from '@/components/settings/do-not-contact-settings';
import { SectorsSettings } from '@/components/settings/sectors-settings';

export const metadata: Metadata = { title: 'Definições' };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Definições"
        description="Setores, lista “não contactar” e conta. Modelos, assinatura e pacotes chegam nas próximas fases."
      />
      <nav aria-label="Secções" className="flex flex-wrap gap-2 text-sm">
        <a href="#setores" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Setores</a>
        <a href="#nao-contactar" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Não contactar</a>
        <a href="#conta" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Conta</a>
      </nav>
      <SectorsSettings />
      <DoNotContactSettings />
      <AccountSettings />
    </div>
  );
}
