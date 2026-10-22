'use client';

/**
 * Lead a partir de um link partilhado: o Android abre /partilhar?title=…&text=…&url=…
 * (Partilhar → VNDesign Leads); no iPhone ou no computador cola-se o link.
 * A plataforma lê o link e abre o formulário de novo lead já preenchido.
 */
import type { Lead, SharedLeadDraft } from '@vndesign/core';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Link2, Share2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LeadForm } from '@/components/leads/lead-form';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

type Payload = { title: string; text: string; url: string };

function toInitial(d: SharedLeadDraft): Partial<Lead> {
  const out: Partial<Lead> = {};
  for (const key of ['company_name', 'website', 'phone', 'email', 'address', 'city', 'source_url'] as const) {
    if (d[key]) out[key] = d[key];
  }
  if (d.channel) out.channel = d.channel;
  return out;
}

export function ShareToLead() {
  const params = useSearchParams();
  const router = useRouter();
  const shared: Payload = { title: params.get('title') ?? '', text: params.get('text') ?? '', url: params.get('url') ?? '' };
  const hasShared = !!(shared.title || shared.text || shared.url);
  const [pasted, setPasted] = useState('');
  const parse = useMutation({
    mutationFn: (body: Payload) => api<{ data: SharedLeadDraft }>('/share', { method: 'POST', body }).then((r) => r.data),
  });
  const started = useRef(false);

  useEffect(() => {
    if (hasShared && !started.current) {
      started.current = true;
      parse.mutate(shared);
    }
  });

  const draft = parse.data;
  return (
    <div className="flex flex-col gap-5">
      {!hasShared || parse.isError ? (
        <Card>
          <CardHeader title="Colar um link" description="Copia o link no Google Maps, no Instagram ou no site e cola-o aqui." />
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (pasted.trim()) parse.mutate({ title: '', text: pasted, url: '' });
            }}
          >
            <Field label="Link ou texto partilhado">
              <Textarea rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
            </Field>
            {parse.isError ? (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(parse.error)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Share2 className="h-3.5 w-3.5" aria-hidden /> No Android, com a app instalada, usa “Partilhar → VNDesign Leads”.
              </p>
              <Button type="submit" loading={parse.isPending} disabled={!pasted.trim()}>
                <Link2 className="h-4 w-4" aria-hidden /> Ler o link
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {parse.isPending ? (
        <Card className="flex flex-col gap-3 p-4" aria-live="polite">
          <p className="text-sm text-muted">A ler o link partilhado… (nome, site e telefone)</p>
          <Skeleton className="h-40" />
        </Card>
      ) : null}

      {draft ? (
        <>
          <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>
              {draft.found.length ? `Encontrado: ${draft.found.join(', ')}.` : 'Não encontrei dados no link: preenche à mão.'}
              {!draft.phone ? ' Sem telefone — confirma no Google Maps ou no site.' : ''} Revê e carrega em Guardar.
            </span>
          </p>
          <LeadForm key={JSON.stringify(draft)} initial={toInitial(draft)} />
          {hasShared ? (
            <Button variant="ghost" className="self-start" onClick={() => router.replace('/partilhar')}>
              Colar outro link
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
