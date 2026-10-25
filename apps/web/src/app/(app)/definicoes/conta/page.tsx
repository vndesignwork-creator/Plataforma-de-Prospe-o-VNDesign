import type { Metadata } from 'next';
import { AccountSettings } from '@/components/settings/account-settings';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { PushSettings } from '@/components/settings/push-settings';
import { SessionsCard, TwoFactorCard } from '@/components/settings/security-settings';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Definições · Conta' };

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <ProfileSettings />
      <AccountSettings />
      {/* Também aqui: a equipa de prospeção só vê a Conta e a Assinatura. */}
      <Card className="p-4">
        <PushSettings />
      </Card>
      <TwoFactorCard />
      <SessionsCard />
    </div>
  );
}
