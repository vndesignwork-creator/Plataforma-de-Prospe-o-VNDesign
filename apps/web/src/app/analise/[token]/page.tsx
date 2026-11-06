import { FREE_AUDIT_PROMO, freeAuditLayoutFrom } from '@vndesign/core';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { freeAuditPage } from '@/server/services/free-audit';
import { EmbedHeight } from './embed-height';
import { FreeAuditForm } from './free-audit-form';

/*
 * "Analisar o meu site grátis" (/analise/<código>, sem login): para pôr no site do dono
 * (link ou dentro de uma moldura com ?embed=1). O visitante recebe a análise por email.
 * Ao lado do formulário, o texto de persuasão com imagem (como no plugin de WordPress):
 * ?texto=0 esconde-o, ?lado=esquerda põe-no à esquerda.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string; texto?: string; lado?: string }> };

export const metadata: Metadata = { title: { absolute: 'Analisar o meu site grátis' }, robots: { index: false, follow: false } };

function Promo() {
  const p = FREE_AUDIT_PROMO;
  return (
    <section aria-label="Porquê analisar o site" className="flex min-w-0 flex-col gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- ilustração SVG estática */}
      <img src="/analise/promo.svg" alt={p.imageAlt} width={560} height={420} className="h-auto max-h-[26rem] w-full rounded-2xl object-contain object-left" />
      <p className="w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-bold tracking-wide text-accent-text uppercase">{p.eyebrow}</p>
      <h2 className="font-display text-2xl leading-tight font-bold sm:text-3xl">{p.title}</h2>
      <p className="text-muted">{p.text}</p>
      <ul className="flex flex-col gap-2.5">
        {p.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <p className="border-t border-border pt-3 text-sm text-muted">{p.note}</p>
    </section>
  );
}

export default async function FreeAuditPage({ params, searchParams }: Props) {
  const token = (await params).token;
  const info = await freeAuditPage(token);
  if (!info) notFound();
  const query = await searchParams;
  const embed = query.embed === '1';
  const layout = freeAuditLayoutFrom(query);
  const brand = info.company ?? 'VNDesign';
  const logo = embed ? null : (
    <p className="mb-6 font-display text-lg font-bold tracking-tight">
      {brand.startsWith('VN') ? (
        <>
          <span className="text-accent">VN</span>
          {brand.slice(2)}
        </>
      ) : (
        brand
      )}
    </p>
  );
  const main = (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Analisar o meu site grátis</h1>
        <p className="text-muted">
          Em poucos minutos recebe por email um relatório simples do seu site: a velocidade no telemóvel, a segurança, como aparece no Google e o que pode estar a afastar clientes. Sem compromisso.
        </p>
      </header>
      <FreeAuditForm token={token} brand={brand} />
    </div>
  );
  return (
    <main
      className={cn(
        'mx-auto w-full',
        embed ? 'p-1' : 'flex min-h-dvh flex-col justify-center px-4 py-8 sm:py-12',
        layout.promo ? (embed ? 'max-w-none' : 'max-w-6xl') : 'max-w-xl',
      )}
    >
      {logo}
      {layout.promo ? (
        // No telemóvel: o formulário primeiro. No computador: o texto do lado escolhido.
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {main}
          <div className={layout.side === 'left' ? 'lg:order-first' : undefined}>
            <Promo />
          </div>
        </div>
      ) : (
        main
      )}
      {embed ? (
        <>
          {/* Dentro de uma moldura: sem fundo próprio, fica o do site. */}
          <style>{'html,body{background:transparent!important}'}</style>
          <EmbedHeight />
        </>
      ) : null}
    </main>
  );
}
