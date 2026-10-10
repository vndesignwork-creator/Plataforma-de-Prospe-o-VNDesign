import type { Metadata } from 'next';
import { ApiSettings } from '@/components/settings/api-settings';

export const metadata: Metadata = { title: 'Definições · API e integrações' };

export default function Page() {
  return <ApiSettings />;
}
