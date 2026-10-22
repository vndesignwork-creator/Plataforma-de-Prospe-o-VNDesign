import type { Metadata } from 'next';
import { AccountSettings } from '@/components/settings/account-settings';
import { SessionsCard, TwoFactorCard } from '@/components/settings/security-settings';

export const metadata: Metadata = { title: 'Definições · Conta' };

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <AccountSettings />
      <TwoFactorCard />
      <SessionsCard />
    </div>
  );
}
