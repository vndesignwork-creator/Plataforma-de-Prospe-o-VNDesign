import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { createSupabaseServerClient } from '@/server/supabase';

export const metadata: Metadata = { title: { default: 'Os meus projetos', template: '%s · Colaborador' }, robots: { index: false, follow: false } };

/** Portal do colaborador: só os projetos para que foi convidado (sem menu da plataforma). */
export default async function CollaboratorLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect('/login?next=/colaborador');
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/colaborador" className="flex items-center gap-2" aria-label="Os meus projetos">
            <Logo />
            <span className="hidden text-sm text-muted sm:inline">Projetos</span>
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden max-w-[16rem] truncate sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-fg">
                <LogOut className="h-4 w-4" aria-hidden /> Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
