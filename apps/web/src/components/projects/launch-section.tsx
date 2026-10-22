'use client';

/**
 * Checklist de lançamento do site: "Verificar o site" confirma sozinho os pontos
 * técnicos (HTTPS, telemóvel, SEO, favicon, 404, sitemap, robots, estatísticas,
 * privacidade, PageSpeed); os outros marcam-se à mão.
 */
import { LAUNCH_CHECKS, formatDateTime, type Lead, type LaunchCheckKey } from '@vndesign/core';
import { CheckCircle2, Rocket, ScanSearch, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useLaunchAction, useLaunchChecklist } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SectionHeader } from './section-header';

export function LaunchSection({ lead }: { lead: Lead }) {
  const { data, isLoading } = useLaunchChecklist(lead.id);
  const action = useLaunchAction(lead.id);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const urlValue = url ?? data?.url ?? '';

  async function run(input: Parameters<typeof action.mutateAsync>[0], success?: string) {
    try {
      const result = await action.mutateAsync(input);
      if (success) toast.success(success.replace('{done}', String(result.done)).replace('{total}', String(result.total)));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function check() {
    // Guarda primeiro o endereço, se foi mudado.
    if (url !== null && url.trim() !== (data?.url ?? '')) await run({ body: { url: url.trim() || null } });
    await run({ check: true }, 'Site verificado: {done} de {total} pontos feitos.');
    setOpen(true);
  }

  const groups = [
    { title: 'Verificado sozinho', items: LAUNCH_CHECKS.filter((c) => c.auto) },
    { title: 'A confirmar por ti', items: LAUNCH_CHECKS.filter((c) => !c.auto) },
  ];

  return (
    <section aria-labelledby={`launch-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`launch-${lead.id}`}
        icon={Rocket}
        title="Checklist de lançamento"
        summary={data ? `${data.done} de ${data.total}` : null}
        action={
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Esconder' : 'Ver lista'}
          </Button>
        }
      />
      {isLoading ? <Skeleton className="mt-2 h-8" /> : null}
      {data ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done} aria-label="Checklist de lançamento">
          <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((data.done / data.total) * 100)}%` }} />
        </div>
      ) : null}
      {open && data ? (
        <div className="mt-3 flex flex-col gap-3">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void check();
            }}
          >
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium">Endereço do site novo</span>
              <Input type="url" inputMode="url" placeholder="https://cliente.pt" value={urlValue} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <Button type="submit" size="sm" loading={action.isPending} disabled={!urlValue.trim()}>
              <ScanSearch className="h-3.5 w-3.5" aria-hidden /> Verificar o site
            </Button>
          </form>
          {action.isPending ? <p className="text-xs text-muted" aria-live="polite">A abrir o site, o sitemap, o robots.txt e o PageSpeed… (até 1 minuto)</p> : null}
          {data.checked_at ? <p className="text-xs text-muted">Última verificação: {formatDateTime(data.checked_at)}</p> : null}
          {groups.map((g) => (
            <fieldset key={g.title}>
              <legend className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{g.title}</legend>
              <ul className="flex flex-col">
                {g.items.map((c) => {
                  const state = data.checks[c.key as LaunchCheckKey];
                  const failed = state?.auto === false && !state.done;
                  return (
                    <li key={c.key} className="flex items-start gap-2 py-1 text-sm">
                      <input
                        id={`launch-${lead.id}-${c.key}`}
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                        checked={!!state?.done}
                        disabled={action.isPending}
                        onChange={(e) => void run({ body: { checks: { [c.key]: e.target.checked } } })}
                      />
                      <label htmlFor={`launch-${lead.id}-${c.key}`} className="min-w-0 flex-1">
                        <span className={cn(state?.done && 'text-muted line-through decoration-muted/50')}>{c.label}</span>
                        {state?.detail ? (
                          <span className={cn('mt-0.5 flex items-center gap-1 text-xs', failed ? 'text-danger' : 'text-muted')}>
                            {state.auto === true ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> : failed ? <XCircle className="h-3.5 w-3.5" aria-hidden /> : null}
                            {state.detail}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>
      ) : null}
    </section>
  );
}
