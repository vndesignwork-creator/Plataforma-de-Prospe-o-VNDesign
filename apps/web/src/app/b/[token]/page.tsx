import { formatDateTime } from '@vndesign/core';
import { CheckCircle2, Paperclip } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicBriefing } from '@/server/services/briefing';
import { BriefingForm } from './briefing-form';

/*
 * Briefing online (link /b/<código>, sem login): o cliente responde às
 * perguntas e junta ficheiros. Pode voltar a abrir o link e completar.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const briefing = await getPublicBriefing((await params).token);
  return { title: { absolute: briefing ? `Briefing · ${briefing.company_name}` : 'Briefing' }, robots: { index: false, follow: false } };
}

export default async function BriefingPage({ params }: Props) {
  const token = (await params).token;
  const briefing = await getPublicBriefing(token);
  if (!briefing) notFound();
  const brand = briefing.brand;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold tracking-tight">
          {brand.startsWith('VN') ? (
            <>
              <span className="text-accent">VN</span>
              {brand.slice(2)}
            </>
          ) : (
            brand
          )}
        </p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Briefing · {briefing.company_name}</h1>
        <p className="text-muted">
          {briefing.contact_name ? `Olá ${briefing.contact_name}! ` : 'Olá! '}
          Estas respostas ajudam-nos a fazer o projeto à sua medida. Pode responder ao que souber e voltar mais tarde a este link para completar.
        </p>
      </header>
      {briefing.status === 'respondido' && briefing.submitted_at ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 font-medium text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> Briefing recebido a {formatDateTime(briefing.submitted_at)}. Obrigado! Pode corrigir e enviar de novo.
        </p>
      ) : null}
      {briefing.files.length ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Paperclip className="h-4 w-4" aria-hidden /> Já enviados: {briefing.files.map((f) => f.name).join(', ')}
        </p>
      ) : null}
      <BriefingForm token={token} questions={briefing.questions} answers={briefing.answers} sentFiles={briefing.files.length} />
    </main>
  );
}
