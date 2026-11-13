import type { Metadata } from 'next';
import { PlatformStatusView } from '@/components/settings/platform-status';

export const metadata: Metadata = { title: 'Definições · Estado da plataforma' };

/** As tarefas automáticas (cron) e os problemas em segundo plano. */
export default function Page() {
  return <PlatformStatusView />;
}
