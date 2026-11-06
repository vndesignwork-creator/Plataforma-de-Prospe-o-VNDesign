import type { Metadata } from 'next';
import { TestimonialsSettings } from '@/components/settings/testimonials-settings';

export const metadata: Metadata = { title: 'Definições · Testemunhos' };

export default function Page() {
  return <TestimonialsSettings />;
}
