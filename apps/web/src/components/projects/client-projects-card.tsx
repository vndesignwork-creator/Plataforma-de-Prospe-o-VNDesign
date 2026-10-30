'use client';

/**
 * Projetos deste cliente: o registo principal e os projetos novos (cliente que
 * volta). Cada projeto tem a sua ficha, com tarefas, pagamentos, horas e
 * contrato próprios; "Novo projeto" cria-o já preparado.
 */
import { PROJECT_STAGE_LABELS, formatCurrency, formatDate, leadPath, type Lead } from '@vndesign/core';
import { CheckCircle2, FolderPlus, Layers } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ServicePicker } from '@/components/services/services';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useClientProjects, useCreateClientProject } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function ClientProjectsCard({ lead }: { lead: Lead }) {
  // Só clientes (ou projetos de um cliente que voltou) podem ter projetos: os outros leads não pedem nada.
  const { data } = useClientProjects(lead.id, lead.status === 'cliente' || !!lead.client_of || !!lead.project_completed_at);
  const [open, setOpen] = useState(false);
  const projects = data?.projects ?? [];
  // Só aparece a clientes (ou a quem já tem mais de um projeto).
  if (lead.status !== 'cliente' && projects.length < 2) return null;
  return (
    <Card id="projetos-cliente" className="scroll-mt-20">
      <CardHeader
        title="Projetos deste cliente"
        description={projects.length > 1 ? `${projects.length} projetos` : 'Quando o cliente voltar, cria aqui o projeto novo.'}
        actions={
          !lead.anonymized_at ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Novo projeto
            </Button>
          ) : null
        }
      />
      {projects.length ? (
        <ul className="flex flex-col p-2" aria-label="Projetos do cliente">
          {projects.map((p) => {
            const current = p.id === lead.id;
            return (
              <li key={p.id}>
                <Link
                  href={leadPath(p)}
                  aria-current={current ? 'page' : undefined}
                  className={cn('flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2', current && 'bg-surface-2')}
                >
                  <Layers className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {p.project_title ?? (p.main ? 'Primeiro projeto' : `Projeto #${p.number}`)}
                      {current ? <span className="ml-1.5 text-xs font-normal text-muted">(esta ficha)</span> : null}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      #{p.number} · desde {formatDate(p.created_at.slice(0, 10))}
                      {p.estimated_value ? ` · ${formatCurrency(p.estimated_value, { decimals: false })}` : ''}
                    </span>
                  </span>
                  {p.completed_at ? (
                    <Badge tone="success" className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" aria-hidden /> Concluído
                    </Badge>
                  ) : p.status === 'cliente' && p.stage ? (
                    <Badge tone="accent">{PROJECT_STAGE_LABELS[p.stage]}</Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {open ? <NewProjectDialog lead={lead} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function NewProjectDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const router = useRouter();
  const create = useCreateClientProject(lead.id);
  const [title, setTitle] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const amount = value.trim() ? Number(value.replace(/\s|€/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) : null;
    try {
      const created = await create.mutateAsync({ title, services, estimated_value: Number.isFinite(amount) ? amount : null });
      toast.success(`Projeto "${title}" criado e preparado (#${created.number}).`);
      onClose();
      router.push(leadPath(created));
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={`Novo projeto para ${lead.company_name}`}
      description="Um registo próprio, com os contactos do cliente: tarefas, pagamentos, horas, contrato e briefing separados deste."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-client-project" loading={create.isPending} disabled={!title.trim()}>
            Criar projeto
          </Button>
        </>
      }
    >
      <form id="new-client-project" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Nome do projeto" required error={errors.title?.[0]}>
          <Input placeholder="Ex.: Loja online, Identidade 2026" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Serviços" hint="O prazo, as revisões e as tarefas vêm dos serviços (como ao passar a Cliente).">
          <ServicePicker value={services} onChange={setServices} />
        </Field>
        <Field label="Valor (€)" hint="Opcional: o plano de pagamentos usa este valor.">
          <Input inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} className="w-40" />
        </Field>
      </form>
    </Dialog>
  );
}
