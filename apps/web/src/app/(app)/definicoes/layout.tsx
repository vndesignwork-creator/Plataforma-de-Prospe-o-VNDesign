import { PageHeader } from '@/components/layout/page-header';
import { SettingsNav } from '@/components/settings/settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Definições" description="O teu perfil, o email, o negócio e a forma como a plataforma funciona." />
      <div className="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
        <SettingsNav />
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
