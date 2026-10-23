import type { Metadata } from 'next';
import { PreferencesSettings } from '@/components/settings/preferences-settings';
import { ProspectingSequenceSettings } from '@/components/settings/prospecting-sequence-settings';

export const metadata: Metadata = { title: 'Definições · Follow-up e lembretes' };

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <PreferencesSettings />
      <ProspectingSequenceSettings />
    </div>
  );
}
