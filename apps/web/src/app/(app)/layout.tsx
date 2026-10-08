import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { createSupabaseServerClient } from '@/server/supabase';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <AppShell email={user.email ?? null}>{children}</AppShell>;
}
