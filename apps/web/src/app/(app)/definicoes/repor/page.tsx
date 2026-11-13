import type { Metadata } from 'next';
import { BackupRestore } from '@/components/settings/backup-restore';

export const metadata: Metadata = { title: 'Definições · Repor a partir de uma cópia' };

export default function Page() {
  return <BackupRestore />;
}
