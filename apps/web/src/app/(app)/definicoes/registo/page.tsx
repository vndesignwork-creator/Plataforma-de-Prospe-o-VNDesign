import type { Metadata } from 'next';
import { AuditLog } from '@/components/settings/audit-log';

export const metadata: Metadata = { title: 'Definições · Registo de alterações' };

/** Quem mudou o quê fora dos leads (dono e administradores). */
export default function Page() {
  return <AuditLog />;
}
