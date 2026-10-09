import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { AccountSettings } from '@/components/settings/account-settings';
import { ApiSettings } from '@/components/settings/api-settings';
import { DoNotContactSettings } from '@/components/settings/do-not-contact-settings';
import { PreferencesSettings } from '@/components/settings/preferences-settings';
import { SectorsSettings } from '@/components/settings/sectors-settings';
import { SignatureSettings } from '@/components/settings/signature-settings';

export const metadata: Metadata = { title: 'Definições' };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Definições"
        description="Assinatura, follow-up e lembretes, setores, lista “não contactar”, API e conta."
      />
      <nav aria-label="Secções" className="flex flex-wrap gap-2 text-sm">
        <a href="#assinatura" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Assinatura</a>
        <a href="#lembretes" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Follow-up e lembretes</a>
        <a href="#setores" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Setores</a>
        <a href="#nao-contactar" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Não contactar</a>
        <a href="#api" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">API e integrações</a>
        <a href="#conta" className="rounded-md bg-surface-2 px-3 py-1.5 hover:bg-surface-3">Conta</a>
      </nav>
      <SignatureSettings />
      <PreferencesSettings />
      <SectorsSettings />
      <DoNotContactSettings />
      <ApiSettings />
      <AccountSettings />
    </div>
  );
}
