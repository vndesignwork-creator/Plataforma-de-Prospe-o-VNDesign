import type { Metadata } from 'next';
import { TaskTemplateSettings } from '@/components/settings/task-template-settings';

export const metadata: Metadata = { title: 'Definições · Listas de tarefas' };

export default function Page() {
  return <TaskTemplateSettings />;
}
