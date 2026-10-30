'use client';

/**
 * Contratos do lead: gerar a partir da proposta, editar as cláusulas, ver o
 * PDF e enviar o link ao cliente, que o aceita online (/c/<código>).
 */
import { CONTRACT_STATUS_LABELS, formatDate, formatDateTime, type ContractContent, type ContractParty, type Lead, type LeadContract } from '@vndesign/core';
import { Copy, FileSignature, FileText, MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useContractAction, useContracts, useProposals, useSignature } from '@/lib/queries';
import { whatsappUrl } from '@/lib/utils';
import { EARLY_STATUSES } from './project-bits';

export const contractUrl = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/c/${token}`;
const code = (n: number) => String(n).padStart(3, '0');

function NewContractDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { data: proposals } = useProposals(lead.id);
  const action = useContractAction(lead.id);
  const preferred = proposals?.find((p) => p.status === 'aceite') ?? proposals?.find((p) => p.status === 'enviada') ?? proposals?.[0];
  const [proposalId, setProposalId] = useState<string | null>(null);
  const chosen = proposalId ?? preferred?.id ?? '';

  async function create() {
    try {
      await action.mutateAsync({ create: { proposal_id: chosen || null } });
      toast.success('Contrato gerado. Revê as cláusulas antes de enviar.');
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Gerar contrato"
      description={lead.company_name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={create} loading={action.isPending}>
            <FileSignature className="h-4 w-4" aria-hidden /> Gerar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Com base na proposta" hint="O objeto, o valor e os pagamentos vêm daqui; o prazo e as revisões vêm do projeto.">
          <Select value={chosen} onChange={(e) => setProposalId(e.target.value)}>
            {(proposals ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.title} ({p.status})
              </option>
            ))}
            <option value="">Sem proposta (valor estimado do lead)</option>
          </Select>
        </Field>
        <p className="text-sm text-muted">As condições gerais e o teu NIF vêm de Definições → Funcionalidades → Contratos.</p>
      </div>
    </Dialog>
  );
}

function PartyFields({ label, party, onChange }: { label: string; party: ContractParty; onChange: (p: ContractParty) => void }) {
  const set = (k: keyof ContractParty, v: string) => onChange({ ...party, [k]: k === 'name' ? v : v || null });
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <Field label="Nome">
        <Input value={party.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
      </Field>
      <Field label="Empresa">
        <Input value={party.company ?? ''} onChange={(e) => set('company', e.target.value)} maxLength={200} />
      </Field>
      <Field label="NIF">
        <Input value={party.nif ?? ''} onChange={(e) => set('nif', e.target.value)} maxLength={20} inputMode="numeric" />
      </Field>
      <Field label="Email">
        <Input value={party.email ?? ''} onChange={(e) => set('email', e.target.value)} maxLength={254} type="email" />
      </Field>
      <Field label="Morada" className="sm:col-span-2">
        <Input value={party.address ?? ''} onChange={(e) => set('address', e.target.value)} maxLength={300} />
      </Field>
    </fieldset>
  );
}

function EditContractDialog({ lead, contract, onClose }: { lead: Lead; contract: LeadContract; onClose: () => void }) {
  const action = useContractAction(lead.id);
  const [title, setTitle] = useState(contract.title);
  const [content, setContent] = useState<ContractContent>(contract.content);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await action.mutateAsync({ id: contract.id, body: { title, content } });
      toast.success('Contrato guardado.');
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.problem.errors) setError(Object.values(err.problem.errors as Record<string, string[]>)[0]?.[0] ?? 'Dados inválidos.');
      else toast.error(errorMessage(err));
    }
  }

  const setSection = (i: number, patch: Partial<ContractContent['sections'][number]>) =>
    setContent({ ...content, sections: content.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={`Editar contrato n.º ${code(contract.number)}`}
      description={lead.company_name}
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={action.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <PartyFields label="Prestador" party={content.provider} onChange={(provider) => setContent({ ...content, provider })} />
        <PartyFields label="Cliente" party={content.client} onChange={(client) => setContent({ ...content, client })} />
        <ol className="flex flex-col gap-3" aria-label="Cláusulas">
          {content.sections.map((section, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-accent-text tabular">{i + 1}.</span>
                <Input aria-label={`Título da cláusula ${i + 1}`} value={section.title} onChange={(e) => setSection(i, { title: e.target.value })} maxLength={120} className="h-9" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Tirar a cláusula ${i + 1}`}
                  onClick={() => setContent({ ...content, sections: content.sections.filter((_, j) => j !== i) })}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <Textarea aria-label={`Texto da cláusula ${i + 1}`} rows={Math.min(10, Math.max(3, section.body.split('\n').length + 1))} value={section.body} onChange={(e) => setSection(i, { body: e.target.value })} maxLength={6000} />
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setContent({ ...content, sections: [...content.sections, { title: 'Nova cláusula', body: '' }] })}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Cláusula
        </Button>
      </div>
    </Dialog>
  );
}

function ContractRow({ lead, contract }: { lead: Lead; contract: LeadContract }) {
  const action = useContractAction(lead.id);
  const { data: signature } = useSignature();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const url = contractUrl(contract.token);
  const accepted = contract.status === 'aceite';
  const message = `Olá${lead.contact_name ? ` ${lead.contact_name}` : ''},\n\nSegue o contrato do projeto. Pode lê-lo, descarregá-lo em PDF e aceitá-lo online aqui:\n${url}\n\nQualquer dúvida, diga-me.\n\nCumprimentos,\n${signature?.full_name ?? ''}`;
  const wa = whatsappUrl(lead.phone, message);
  const markSent = () => (contract.status === 'rascunho' ? action.mutate({ id: contract.id, sent: true }) : undefined);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado.');
      markSent();
    } catch {
      toast.error('Não foi possível copiar. Seleciona o link e copia manualmente.');
    }
  }

  async function remove() {
    try {
      await action.mutateAsync({ id: contract.id, remove: true });
      setConfirm(false);
      toast.success('Contrato apagado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileSignature className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="font-medium">Contrato n.º {code(contract.number)}</span>
        <Badge tone={accepted ? 'success' : contract.status === 'enviado' ? 'accent' : 'neutral'}>{CONTRACT_STATUS_LABELS[contract.status]}</Badge>
        <span className="text-xs text-muted">
          {accepted
            ? `${contract.accepted_name} · ${formatDateTime(contract.accepted_at!)}`
            : contract.sent_at
              ? `Enviado a ${formatDate(contract.sent_at)}`
              : `Criado a ${formatDate(contract.created_at)}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/v1/contracts/${contract.id}/pdf`} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'sm')}>
          <FileText className="h-3.5 w-3.5" aria-hidden /> PDF
        </a>
        {!accepted ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
            </Button>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar link
            </Button>
            {lead.email ? (
              <SendEmailButton
                lead={lead}
                subject={`Contrato — ${lead.company_name}`}
                body={message}
                template="Contrato"
                label="Enviar por email"
                variant="outline"
                onSent={markSent}
              />
            ) : null}
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" onClick={markSent} className={buttonClasses('outline', 'sm')}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
              </a>
            ) : null}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfirm(true)} aria-label={`Apagar o contrato n.º ${code(contract.number)}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
            Ver como o cliente
          </a>
        )}
      </div>
      {editing ? <EditContractDialog lead={lead} contract={contract} onClose={() => setEditing(false)} /> : null}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Apagar o contrato?"
        description={contract.status === 'enviado' ? 'O link enviado ao cliente deixa de funcionar.' : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button variant="danger" onClick={remove} loading={action.isPending}>
              Apagar
            </Button>
          </>
        }
      />
    </li>
  );
}

export function ContractsCard({ lead }: { lead: Lead }) {
  // Antes da reunião/proposta não há contratos: nem se pergunta ao servidor (o cartão não aparece).
  const { data: contracts, isLoading } = useContracts(lead.id, !EARLY_STATUSES.includes(lead.status));
  const [creating, setCreating] = useState(false);
  const relevant = ['proposta_enviada', 'cliente'].includes(lead.status) || !!contracts?.length;
  if (lead.anonymized_at || (!isLoading && !relevant)) return null;
  return (
    <Card id="contratos" className="scroll-mt-20">
      <CardHeader
        title="Contratos"
        description="Gerado a partir da proposta e aceite online pelo cliente."
        actions={
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Gerar contrato
          </Button>
        }
      />
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-12" />
        </div>
      ) : contracts?.length ? (
        <ul className="divide-y divide-border" aria-label="Contratos do lead">
          {contracts.map((c) => (
            <ContractRow key={c.id} lead={lead} contract={c} />
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted">Ainda sem contratos. Gera um a partir da proposta aceite.</p>
      )}
      {creating ? <NewContractDialog lead={lead} onClose={() => setCreating(false)} /> : null}
    </Card>
  );
}
