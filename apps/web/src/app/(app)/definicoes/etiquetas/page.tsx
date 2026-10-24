import type { Metadata } from 'next';
import { TagsSettings } from '@/components/settings/tags-settings';

export const metadata: Metadata = { title: 'Definições · Etiquetas' };

export default function Page() {
  return <TagsSettings />;
}
