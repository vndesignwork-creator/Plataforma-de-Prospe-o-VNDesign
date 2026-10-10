import type { Metadata } from 'next';
import { ServicesSettings } from '@/components/settings/services-settings';

export const metadata: Metadata = { title: 'Definições · Serviços' };

export default function Page() {
  return <ServicesSettings />;
}
