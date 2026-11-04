'use client';

/**
 * Ajuda: um guia curto por secção da plataforma. Abre no guia do endereço
 * (/ajuda#leads), que é para onde aponta o "?" ao lado do título de cada página.
 */
import { ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
      <PageHeader title="Ajuda" description="Guias curtos de cada parte da plataforma. O “?” ao lado do título de cada página traz aqui." />
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
