import type { Metadata } from 'next';
import { DoNotContactSettings } from '@/components/settings/do-not-contact-settings';

export const metadata: Metadata = { title: 'Definições · Não contactar' };

export default function Page() {
  return <DoNotContactSettings />;
}
