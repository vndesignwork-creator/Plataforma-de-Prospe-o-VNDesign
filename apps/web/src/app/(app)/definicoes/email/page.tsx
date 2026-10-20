import type { Metadata } from 'next';
import { MailSettings } from '@/components/settings/mail-settings';

export const metadata: Metadata = { title: 'Definições · Email de envio' };

export default function Page() {
  return <MailSettings />;
}
