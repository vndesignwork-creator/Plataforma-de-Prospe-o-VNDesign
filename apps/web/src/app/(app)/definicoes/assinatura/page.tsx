import type { Metadata } from 'next';
import { BusinessCardSettings } from '@/components/settings/business-card-settings';
import { SignatureSettings } from '@/components/settings/signature-settings';

export const metadata: Metadata = { title: 'Definições · Assinatura' };

export default function Page() {
  return (
    <>
      <SignatureSettings />
      <BusinessCardSettings />
    </>
  );
}
