import type { Metadata } from 'next';
import { AutomationSettings } from '@/components/settings/automation-settings';

export const metadata: Metadata = { title: 'Definições · Regras automáticas' };

export default function Page() {
  return <AutomationSettings />;
}
