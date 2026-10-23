import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import { getTeamInvite } from '@/server/services/team';
import { createSupabaseServerClient } from '@/server/supabase';
import { InviteForm } from '../../convite/[token]/invite-form';

/** Convite para a equipa (/equipa/<código>, sem login). */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Convite para a equipa', robots: { index: false, follow: false } };

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const invite = await getTeamInvite(token);
  if (!invite) notFound();
  const { data } = await (await createSupabaseServerClient()).auth.getUser();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo className="text-2xl" />
          <h1 className="mt-6 text-2xl font-bold">Convite para a equipa</h1>
          <p className="mt-2 text-sm text-muted">
            <strong className="text-fg">{invite.inviter}</strong> convidou-te para a equipa
            {invite.role === 'prospector'
              ? ': vais procurar, gerar, organizar e contactar leads.'
              : ' como administrador: vais ter acesso a toda a plataforma.'}
          </p>
        </div>
        <InviteForm token={token} email={invite.email} name={invite.name} accepted={invite.accepted} sessionEmail={data.user?.email ?? null} kind="team" />
      </div>
    </main>
  );
}
