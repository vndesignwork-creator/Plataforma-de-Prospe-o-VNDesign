import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import { getInvite } from '@/server/services/collaborators';
import { createSupabaseServerClient } from '@/server/supabase';
import { InviteForm } from './invite-form';

/** Convite para colaborar num projeto (/convite/<código>, sem login). */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Convite para um projeto', robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const invite = await getInvite(token);
  if (!invite) notFound();
  const { data } = await (await createSupabaseServerClient()).auth.getUser();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo className="text-2xl" />
          <h1 className="mt-6 text-2xl font-bold">Projeto {invite.company_name}</h1>
          <p className="mt-2 text-sm text-muted">
            <strong className="text-fg">{invite.inviter}</strong> convidou-te para colaborar neste projeto: vais ver as tarefas, os ficheiros e o
            briefing, e podes registar as tuas horas.
          </p>
        </div>
        <InviteForm token={token} email={invite.email} name={invite.name} accepted={invite.status === 'ativo'} sessionEmail={data.user?.email ?? null} />
      </div>
    </main>
  );
}
