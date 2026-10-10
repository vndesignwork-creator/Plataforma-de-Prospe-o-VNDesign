import { PageHeader } from '@/components/layout/page-header';
import { SettingsNav } from '@/components/settings/settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Definições" description="A tua assinatura, os lembretes, as propostas, as listas de tarefas e a conta." />
      <SettingsNav />
      {children}
    </div>
  );
}
