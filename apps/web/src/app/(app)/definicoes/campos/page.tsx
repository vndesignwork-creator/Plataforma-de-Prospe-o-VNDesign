import type { Metadata } from 'next';
import { CustomFieldsSettings } from '@/components/settings/custom-fields-settings';

export const metadata: Metadata = { title: 'Definições · Campos personalizados' };

export default function Page() {
  return <CustomFieldsSettings />;
}
