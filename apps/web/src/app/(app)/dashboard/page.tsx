import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="O que há para fazer hoje e como está o pipeline." />
      <DashboardView />
    </>
  );
}
