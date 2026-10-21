import type { Metadata } from 'next';
import { FeaturesSettings } from '@/components/settings/features-settings';

export const metadata: Metadata = { title: 'Definições · Funcionalidades' };

export default function Page() {
  return <FeaturesSettings />;
}
