import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { isCollaborator } from '@/server/services/collaborators';
import { createSupabaseServerClient } from '@/server/supabase';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  // Conta de colaborador (sem workspace): vai para o portal dos projetos.
  const { count } = await supabase.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('user_id', user.id);
  if (!count && (await isCollaborator(user.id))) redirect('/colaborador');
  return <AppShell email={user.email ?? null}>{children}</AppShell>;
}
