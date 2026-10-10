import type { Metadata } from 'next';
import { SectorsSettings } from '@/components/settings/sectors-settings';

export const metadata: Metadata = { title: 'Definições · Setores' };

export default function Page() {
  return <SectorsSettings />;
}
