import type { Metadata } from 'next';
import { FixedCostsSettings } from '@/components/settings/fixed-costs-settings';

export const metadata: Metadata = { title: 'Definições · Custos fixos' };

export default function Page() {
  return <FixedCostsSettings />;
}
