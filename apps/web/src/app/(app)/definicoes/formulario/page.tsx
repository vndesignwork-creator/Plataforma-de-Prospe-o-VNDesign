import type { Metadata } from 'next';
import { SiteFormSettings } from '@/components/settings/site-form-settings';

export const metadata: Metadata = { title: 'Definições · Formulário do site' };

export default function Page() {
  return <SiteFormSettings />;
}
