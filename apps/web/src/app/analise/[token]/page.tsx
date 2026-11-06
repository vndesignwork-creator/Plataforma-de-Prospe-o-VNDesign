import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { freeAuditPage } from '@/server/services/free-audit';
import { FreeAuditForm } from './free-audit-form';

/*
 * "Analisar o meu site grátis" (/analise/<código>, sem login): para pôr no site do dono
 * (link ou dentro de uma moldura com ?embed=1). O visitante recebe a análise por email.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string }> };

export const metadata: Metadata = { title: { absolute: 'Analisar o meu site grátis' }, robots: { index: false, follow: false } };

export default async function FreeAuditPage({ params, searchParams }: Props) {
  const token = (await params).token;
  const info = await freeAuditPage(token);
  if (!info) notFound();
  const embed = (await searchParams).embed === '1';
  const brand = info.company ?? 'VNDesign';
  return (
    <main className={embed ? 'mx-auto w-full max-w-xl p-4' : 'mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 py-8 sm:py-12'}>
      <header className="flex flex-col gap-2">
        {!embed ? (
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
        ) : null}
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Analisar o meu site grátis</h1>
        <p className="text-muted">
          Em poucos minutos recebe por email um relatório simples do seu site: a velocidade no telemóvel, a segurança, como aparece no Google e o que pode estar a afastar clientes. Sem compromisso.
        </p>
      </header>
      <FreeAuditForm token={token} brand={brand} />
    </main>
  );
}
