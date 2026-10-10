import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { AccountSettings } from '@/components/settings/account-settings';
import { ApiSettings } from '@/components/settings/api-settings';
import { DoNotContactSettings } from '@/components/settings/do-not-contact-settings';
import { PreferencesSettings } from '@/components/settings/preferences-settings';
import { ProposalSettings } from '@/components/settings/proposal-settings';
import { SectorsSettings } from '@/components/settings/sectors-settings';
import { SignatureSettings } from '@/components/settings/signature-settings';
import { TaskTemplateSettings } from '@/components/settings/task-template-settings';

export const metadata: Metadata = { title: 'Definições' };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 [&>[id]]:scroll-mt-32 lg:[&>[id]]:scroll-mt-28">
      <PageHeader
        title="Definições"
        description="Assinatura, lembretes, propostas e IA, listas de tarefas, setores, lista “não contactar”, API e conta."
      />
      {/* Índice preso ao topo: numa página comprida, salta-se de secção sem voltar ao início. */}
      <nav
        aria-label="Secções"
        className="sticky top-14 z-30 -mx-4 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:rounded-b-xl lg:px-0"
      >
        <ul className="flex gap-2 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
          <li>
            <a href="#assinatura" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              Assinatura
            </a>
          </li>
          <li>
            <a href="#lembretes" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              Follow-up e lembretes
            </a>
          </li>
          <li>
            <a href="#propostas" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              Propostas e IA
            </a>
          </li>
          <li>
            <a href="#listas-tarefas" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              Listas de tarefas
            </a>
          </li>
          <li>
            <a href="#setores" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              Setores
            </a>
          </li>
          <li>
            <a href="#nao-contactar" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              Não contactar
            </a>
          </li>
          <li>
            <a href="#api" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              API e integrações
            </a>
          </li>
          <li>
            <a href="#conta" className="inline-flex min-h-8 items-center rounded-md bg-surface-2 px-3 hover:bg-surface-3 pointer-coarse:min-h-10">
              Conta
            </a>
          </li>
        </ul>
      </nav>
      <SignatureSettings />
      <PreferencesSettings />
      <ProposalSettings />
      <TaskTemplateSettings />
      <SectorsSettings />
      <DoNotContactSettings />
      <ApiSettings />
      <AccountSettings />
    </div>
  );
}
