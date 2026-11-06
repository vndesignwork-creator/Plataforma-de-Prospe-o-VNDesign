import type { Metadata } from 'next';
import { CustomFieldPacks } from '@/components/settings/custom-field-packs';
import { CustomFieldsSettings } from '@/components/settings/custom-fields-settings';

export const metadata: Metadata = { title: 'Definições · Campos personalizados' };

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <CustomFieldsSettings />
      <CustomFieldPacks />
    </div>
  );
}
