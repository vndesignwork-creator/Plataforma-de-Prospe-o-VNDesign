'use client';

/**
 * Ajuda: um guia curto por secção da plataforma. Abre no guia do endereço
 * (/ajuda#leads). Abre-se a partir das Definições, da pesquisa rápida e da ajuda do Kanban e da Prospeção.
 */
import { ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/layout/page-header';
import { Input } from '@/components/ui/input';
import { HELP_GUIDES, type HelpGuide } from '@/lib/help-guides';
import { useRole } from '@/lib/queries';
import { prospectorPageAllowed } from '@/lib/role-access';
import { cn } from '@/lib/utils';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const guideText = (g: HelpGuide) => normalize([g.title, g.summary, ...g.steps, ...(g.tips ?? [])].join(' '));

export function HelpView() {
  const role = useRole();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const guides = useMemo(() => HELP_GUIDES.filter((g) => role !== 'prospector' || prospectorPageAllowed(g.href)), [role]);
  const words = normalize(q).split(/\s+/).filter(Boolean);
  const shown = words.length ? guides.filter((g) => words.every((w) => guideText(g).includes(w))) : guides;

  // O guia do endereço (#leads) abre e fica à vista.
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      setOpenId(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: 'Definições', href: '/definicoes' }]} />}
        title="Ajuda"
        description="O que é a plataforma e um guia curto de cada parte."
      />
      <About />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar na ajuda…" aria-label="Procurar na ajuda" className="pl-9" />
      </div>
      {words.length ? null : (
        <nav aria-label="Guias" className="mb-5 flex flex-wrap gap-2">
          {guides.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="rounded-full border border-border px-3 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              {g.title}
            </a>
          ))}
        </nav>
      )}
      {shown.length ? (
        <div className="flex flex-col gap-3">
          {shown.map((g) => (
            <GuideCard
              key={g.id}
              guide={g}
              open={words.length > 0 || openId === g.id}
              onToggle={(open) => setOpenId(open ? g.id : openId === g.id ? null : openId)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Nada encontrado para “{q}”. Experimenta outra palavra, ou Ctrl K para procurar na plataforma.</p>
      )}
    </>
  );
}

/** O que é a plataforma e para que serve (antes dos guias). */
function About() {
  const steps = [
    { title: 'Encontrar', text: 'Importar, criar ou gerar com IA leads de empresas que precisam de um site.' },
    { title: 'Contactar', text: 'Email, telefone ou WhatsApp com mensagens prontas, numa sessão de prospeção.' },
    { title: 'Acompanhar', text: 'Follow-ups, respostas e tarefas no dia certo, sem nada esquecido.' },
    { title: 'Fechar', text: 'Diagnóstico do site atual, propostas e contratos.' },
    { title: 'Entregar', text: 'O projeto do cliente: fases, prazos, pagamentos, horas e entregas.' },
  ];
  return (
    <section aria-labelledby="ajuda-sobre" className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="ajuda-sobre" className="text-lg font-semibold">
        O que é o VNDesign Leads
      </h2>
      <p className="mt-1 text-sm text-muted">
        É a plataforma de prospeção e gestão de clientes da VNDesign: junta num só sítio tudo o que vai desde encontrar uma empresa que pode precisar de um
        site novo até entregar o projeto e receber o pagamento.
      </p>
      <p className="mt-2 text-sm">
        <span className="font-medium">O objetivo:</span> <span className="text-muted">conseguir mais clientes com menos trabalho manual — saber sempre quem contactar hoje, não perder nenhum follow-up, perceber o que resulta (e o que não) e acompanhar cada projeto até ao fim.</span>
      </p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-lg bg-surface-2 p-3">
            <p className="text-sm font-semibold">
              <span className="mr-1.5 text-accent-text tabular">{i + 1}.</span>
              {s.title}
            </p>
            <p className="mt-1 text-xs text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GuideCard({ guide, open, onToggle }: { guide: HelpGuide; open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <details
      id={guide.id}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        if (now !== open) onToggle(now);
      }}
      className="group scroll-mt-20 rounded-xl border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{guide.title}</span>
          <span className="block text-sm text-muted">{guide.summary}</span>
        </span>
        <ArrowRight className={cn('mt-1 h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-90')} aria-hidden />
      </summary>
      <div className="border-t border-border px-4 py-3 text-sm">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          {guide.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {guide.tips?.length ? (
          <ul className="mt-3 flex flex-col gap-1 text-muted">
            {guide.tips.map((t) => (
              <li key={t}>💡 {t}</li>
            ))}
          </ul>
        ) : null}
        <Link href={guide.href} className="mt-3 inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
          Abrir {guide.title === 'Primeiros passos' ? 'Definições' : guide.title} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </details>
  );
}
