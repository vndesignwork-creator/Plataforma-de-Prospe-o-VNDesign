import type { Metadata } from 'next';
import { StatsView } from '@/components/dashboard/stats-view';

export const metadata: Metadata = { title: 'Estatísticas' };

export default function StatsPage() {
  return <StatsView />;
}
