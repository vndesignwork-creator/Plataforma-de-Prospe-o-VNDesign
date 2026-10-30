import type { Metadata } from 'next';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  // O cabeçalho (saudação, o dia e as ações) está na vista.
  return <DashboardView />;
}
