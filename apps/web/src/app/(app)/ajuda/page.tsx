import type { Metadata } from 'next';
import { HelpView } from '@/components/help/help-view';

export const metadata: Metadata = { title: 'Ajuda' };

export default function AjudaPage() {
  return <HelpView />;
}
