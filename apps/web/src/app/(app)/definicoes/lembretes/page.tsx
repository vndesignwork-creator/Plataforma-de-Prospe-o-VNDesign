import type { Metadata } from 'next';
import { PreferencesSettings } from '@/components/settings/preferences-settings';

export const metadata: Metadata = { title: 'Definições · Follow-up e lembretes' };

export default function Page() {
  return <PreferencesSettings />;
}
