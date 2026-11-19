'use client';

/**
 * Caso de estudo do projeto, escrito com IA a partir do que já está na ficha
 * (problemas, análise do site, entregas, horas, testemunho). Serve para o
 * portefólio e para juntar às propostas: copia-se o texto ou leva-se o PDF.
 */
import {
  CASE_STUDY_TONES,
  CASE_STUDY_TONE_LABELS,
  caseStudyText,
  formatDateTime,
  type CaseStudyTone,
  type Lead,
} from '@vndesign/core';
import { Copy, FileText, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useCaseStudy, useCaseStudyAction } from '@/lib/queries';
import { SectionHeader } from './section-header';

export function CaseStudySection({ lead }: { lead: Lead }) {
  const { data: study, isLoading } = useCaseStudy(lead.id, !!lead.project_completed_at);
  const action = useCaseStudyAction(lead.id);
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<CaseStudyTone>('profissional');
  const [anonymous, setAnonymous] = useState(false);
  const [notes, setNotes] = useState('');
  if (!lead.project_completed_at) return null;

  async function write() {
    try {
      await action.mutateAsync({ tone, anonymous, notes: notes.trim() });
      setOpen(true);
      toast.success('Caso de estudo escrito. Lê e muda o que quiseres antes de usar.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function copy() {
    if (!study) return;
    try {
      await navigator.clipboard.writeText(caseStudyText(study));
      toast.success('Caso de estudo copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <section aria-labelledby={`case-study-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`case-study-${lead.id}`}
        icon={Sparkles}
        title="Caso de estudo"
        summary={study ? 'escrito' : null}
        action={
          study ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Ver
            </Button>
          ) : (
            <Button size="sm" variant="outline" loading={action.isPending} onClick={() => void write()} disabled={!!lead.anonymized_at}>
              <Wand2 className="h-3.5 w-3.5" aria-hidden /> Escrever com IA
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : study ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted">{study.title}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          A IA junta o que está na ficha (problemas do site, entregas, horas e o testemunho) e escreve o caso para o portefólio e para as propostas.
        </p>
      )}

      {open && study ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title={study.title}
          description={`Escrito com IA a ${formatDateTime(study.created_at)} · ${study.model}. Confirma os factos antes de publicar.`}
          className="sm:max-w-2xl"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!confirm('Apagar o caso de estudo?')) return;
                  action.mutate(
                    { remove: true },
                    { onSuccess: () => setOpen(false), onError: (e) => toast.error(errorMessage(e)) },
                  );
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Apagar
              </Button>
              <Button variant="ghost" loading={action.isPending} onClick={() => void write()}>
                <Wand2 className="h-4 w-4" aria-hidden /> Escrever outra vez
              </Button>
              <Button variant="outline" onClick={() => void copy()}>
                <Copy className="h-4 w-4" aria-hidden /> Copiar texto
              </Button>
              <a href={`/api/v1/leads/${lead.id}/case-study/pdf`} target="_blank" rel="noopener" className={buttonClasses('primary')}>
                <FileText className="h-4 w-4" aria-hidden /> Ver PDF
              </a>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="O que queres destacar" hint="Opcional. Ex.: a loja online e as encomendas por WhatsApp.">
                <Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Field label="Tom">
                <Select value={tone} onChange={(e) => setTone(e.target.value as CaseStudyTone)}>
                  {CASE_STUDY_TONES.map((t) => (
                    <option key={t} value={t}>
                      {CASE_STUDY_TONE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Sem o nome do cliente (“uma padaria em Braga”)
            </label>

            <article className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
              <p className="text-base font-medium">{study.summary}</p>
              <div>
                <h3 className="font-semibold">O desafio</h3>
                <p className="mt-0.5 whitespace-pre-line text-muted">{study.challenge}</p>
              </div>
              {study.work.length ? (
                <div>
                  <h3 className="font-semibold">O que fizemos</h3>
                  <ul className="mt-0.5 list-disc pl-5 text-muted">
                    {study.work.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <h3 className="font-semibold">O resultado</h3>
                <p className="mt-0.5 whitespace-pre-line text-muted">{study.result}</p>
              </div>
              {study.quote ? (
                <blockquote className="border-l-2 border-accent pl-3 text-muted italic">
                  “{study.quote}”{study.quote_author ? <footer className="mt-1 text-xs not-italic">— {study.quote_author}</footer> : null}
                </blockquote>
              ) : null}
            </article>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
