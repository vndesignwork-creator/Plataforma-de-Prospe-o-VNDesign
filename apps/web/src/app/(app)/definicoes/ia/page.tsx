import type { Metadata } from 'next';
import { AiSettings } from '@/components/settings/ai-settings';

export const metadata: Metadata = { title: 'Definições · Inteligência artificial' };

export default function Page() {
  return <AiSettings />;
}
