import type { Metadata } from 'next';
import { AccountSettings } from '@/components/settings/account-settings';

export const metadata: Metadata = { title: 'Definições · Conta' };

export default function Page() {
  return <AccountSettings />;
}
