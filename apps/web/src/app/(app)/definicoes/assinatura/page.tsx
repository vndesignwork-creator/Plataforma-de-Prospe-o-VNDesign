import type { Metadata } from 'next';
import { SignatureSettings } from '@/components/settings/signature-settings';

export const metadata: Metadata = { title: 'Definições · Assinatura' };

export default function Page() {
  return <SignatureSettings />;
}
