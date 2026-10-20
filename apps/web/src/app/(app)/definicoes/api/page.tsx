import type { Metadata } from 'next';
import { ApiSettings } from '@/components/settings/api-settings';

export const metadata: Metadata = { title: 'Definições · Acesso externo (API)' };

export default function Page() {
  return <ApiSettings />;
}
