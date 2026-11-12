import { FREE_AUDIT_PROMO, freeAuditLayoutFrom } from '@vndesign/core';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { freeAuditPage } from '@/server/services/free-audit';
import { EmbedHeight } from './embed-height';
import { FreeAuditForm } from './free-audit-form';
import { PromoImage } from './promo-image';
import { RevealOnScroll } from './reveal-on-scroll';

/*
 * "Analisar o meu site grátis" (/analise/<código>, sem login): para pôr no site do dono
 * (link ou dentro de uma moldura com ?embed=1). O visitante recebe a análise por email.
 * Ao lado do formulário, o texto de persuasão com imagem (como no plugin de WordPress):
 * De origem fica à esquerda (no telemóvel, por cima do formulário); ?lado=direita põe-no à
 * direita e ?texto=0 esconde-o. Claro/escuro: o do computador do visitante, ou ?tema=claro|escuro.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string; texto?: string; lado?: string; tema?: string }> };

export const metadata: Metadata = { title: { absolute: 'Analisar o meu site grátis' }, robots: { index: false, follow: false } };

/**
 * Tema da página pública: segue o claro/escuro do computador do visitante (e muda com ele);
 * ?tema=claro ou ?tema=escuro fixa-o (ex.: dentro de uma moldura num site claro).
 */
const PUBLIC_THEME_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get('tema');var mq=window.matchMedia('(prefers-color-scheme: light)');var apply=function(){document.documentElement.dataset.theme=q==='claro'?'light':q==='escuro'?'dark':mq.matches?'light':'dark';};apply();if(q!=='claro'&&q!=='escuro'&&mq.addEventListener)mq.addEventListener('change',apply);}catch(e){}})();`;

/**
 * Animações como as do site (e do plugin): os elementos marcados com data-reveal-item ficam
 * escondidos desde o início (sem "piscar") e sobem ao entrar no ecrã. Sem movimento reduzido e só
 * com IntersectionObserver; se o JavaScript não chegar em 4 s, aparece tudo.
 */
const REVEAL_PENDING_SCRIPT = `(function(){try{if(!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var h=document.documentElement;h.classList.add('reveal-pending');setTimeout(function(){if(!h.classList.contains('reveal-ready'))h.classList.remove('reveal-pending');},4000);}catch(e){}})();`;

function Promo() {
  const p = FREE_AUDIT_PROMO;
  // O título grande da página é o do texto de persuasão (o formulário fica sem título próprio).
  return (
    <section aria-label="Porquê analisar o site" className="flex h-full min-w-0 flex-col gap-4">
      {/* Imagem na horizontal: no computador estica ou encolhe até a coluna ficar da altura do formulário. */}
      <PromoImage alt={p.imageAlt} />
      <p data-reveal-item className="w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-bold tracking-wide text-accent-text uppercase">{p.eyebrow}</p>
      <h1 data-reveal-item className="font-display text-2xl leading-tight font-bold sm:text-3xl lg:text-2xl xl:text-3xl">{p.title}</h1>
      <p data-reveal-item className="text-muted">{p.text}</p>
      <ul className="flex flex-col gap-2">
        {p.points.map((point) => (
          <li key={point} data-reveal-item className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <p data-reveal-item className="border-t border-border pt-3 text-sm text-muted">{p.note}</p>
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
  const form = <FreeAuditForm token={token} brand={brand} turnstileSiteKey={info.turnstile_site_key} stretch={layout.promo} />;
  // Com o texto de persuasão ao lado, o formulário fica sem título (um título a menos).
  const main = layout.promo ? (
    <div className="flex min-w-0 flex-1 flex-col gap-5">{form}</div>
  ) : (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Analisar o meu site grátis</h1>
        <p className="text-muted">
          Em poucos minutos recebe por email um relatório simples do seu site: a velocidade no telemóvel, a segurança, como aparece no Google e nas IAs (ChatGPT, Gemini) e o que pode estar a afastar clientes. Sem compromisso.
        </p>
      </header>
      {form}
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
      {/* Antes de pintar: o claro/escuro do computador do visitante (não o da plataforma), ou ?tema=claro|escuro. */}
      <script dangerouslySetInnerHTML={{ __html: PUBLIC_THEME_SCRIPT + REVEAL_PENDING_SCRIPT }} />
      <RevealOnScroll />
      {logo}
      {layout.promo ? (
        // No telemóvel: o texto por cima do formulário. No computador: o texto do lado escolhido.
        <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-14">
          <div className={layout.side === 'right' ? 'lg:order-last' : undefined}>
            <Promo />
          </div>
          <div className="flex flex-col">{main}</div>
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
