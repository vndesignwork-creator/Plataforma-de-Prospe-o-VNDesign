'use client';

import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  formatCurrency,
  formatDate,
  isRecurringPackage,
  itemFromPackage,
  mailtoUrl,
  parseEuroAmount,
  proposalTotals,
  suggestProposalIntro,
  type Lead,
  type Proposal,
  type ProposalItem,
  type ProposalStatus,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, FileText, Mail, Plus, Send, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useAudits, useInvalidateLead, useLead, useLogActivity, usePackages, useProposal } from '@/lib/queries';
import { PROPOSAL_TONES } from './proposals-card';

/** Item em edição (números como texto para o utilizador poder escrever "1.200,50"). */
interface DraftItem {
  key: string;
  name: string;
  description: string;
  features: string;
  price: string;
  quantity: string;
  recurring: boolean;
  package_id: string | null;
}

let keySeq = 0;
const newKey = () => `i${++keySeq}`;
const toDraft = (i: ProposalItem): DraftItem => ({
  key: newKey(),
  name: i.name,
  description: i.description ?? '',
  features: i.features.join('\n'),
  price: String(i.price).replace('.', ','),
  quantity: String(i.quantity),
  recurring: i.recurring,
  package_id: i.package_id,
});
const parseNumber = (v: string) => parseEuroAmount(v) ?? NaN;
const fromDraft = (d: DraftItem): ProposalItem => ({
  name: d.name.trim(),
  description: d.description.trim() || null,
  features: d.features.split('\n').map((f) => f.trim()).filter(Boolean),
  price: Math.max(0, parseNumber(d.price) || 0),
  quantity: Math.max(1, Math.round(parseNumber(d.quantity) || 1)),
  recurring: d.recurring,
  package_id: d.package_id,
});

function Editor({ lead, proposal }: { lead: Lead; proposal: Proposal | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const invalidateLead = useInvalidateLead();
  const log = useLogActivity(lead.id);
  const { data: packages } = usePackages();
  const { data: audits } = useAudits(lead.id);
  const latestAudit = audits?.find((a) => a.status === 'done');

  const [title, setTitle] = useState(proposal?.title ?? `Proposta de website — ${lead.company_name}`);
  const [intro, setIntro] = useState(
    proposal?.intro ??
      suggestProposalIntro({
        companyName: lead.company_name,
        contactName: lead.contact_name,
        website: lead.website,
        problems: lead.problems,
        approachAngle: lead.approach_angle,
      }),
  );
  const [items, setItems] = useState<DraftItem[]>(() => proposal?.items.map(toDraft) ?? []);
  const [discount, setDiscount] = useState(proposal ? String(proposal.discount).replace('.', ',') : '0');
  const [validUntil, setValidUntil] = useState(proposal?.valid_until ?? '');
  const [paymentTerms, setPaymentTerms] = useState(proposal?.payment_terms ?? '');
  const [notes, setNotes] = useState(proposal?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  // Novo rascunho: começa com o pacote recomendado.
  const [seeded, setSeeded] = useState(!!proposal);
  if (!seeded && packages) {
    setSeeded(true);
    const rec = packages.find((p) => p.recommended && !isRecurringPackage(p));
    if (rec) setItems([toDraft(itemFromPackage(rec))]);
  }

  const parsedItems = items.map(fromDraft);
  const totals = proposalTotals(parsedItems, Math.max(0, parseNumber(discount) || 0));

  function patchItem(key: string, patch: Partial<DraftItem>) {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function move(key: string, dir: -1 | 1) {
    setItems((list) => {
      const i = list.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  }

  function suggestIntro() {
    setIntro(
      suggestProposalIntro({
        companyName: lead.company_name,
        contactName: lead.contact_name,
        website: lead.website,
        problems: lead.problems,
        issues: latestAudit?.issues,
        approachAngle: lead.approach_angle,
      }),
    );
  }

  async function save(): Promise<Proposal | null> {
    setSaving(true);
    setErrors({});
    const body = {
      title,
      intro: intro || null,
      items: parsedItems,
      discount: Math.max(0, parseNumber(discount) || 0),
      valid_until: validUntil || null,
      payment_terms: paymentTerms || null,
      notes: notes || null,
    };
    try {
      const { data } = proposal
        ? await api<{ data: Proposal }>(`/proposals/${proposal.id}`, { method: 'PATCH', body })
        : await api<{ data: Proposal }>(`/leads/${lead.id}/proposals`, { method: 'POST', body });
      qc.setQueryData(['proposal', data.id], data);
      void qc.invalidateQueries({ queryKey: ['proposals', lead.id] });
      toast.success(proposal ? 'Proposta guardada.' : `Proposta ${data.code} criada.`);
      if (!proposal) router.replace(`/leads/${lead.id}/propostas/${data.id}`);
      return data;
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors);
      toast.error(errorMessage(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: ProposalStatus) {
    if (!proposal) return;
    setBusy(true);
    try {
      if (status === 'enviada') {
        await api(`/proposals/${proposal.id}/send`, { method: 'POST' });
        invalidateLead(lead.id);
        toast.success('Marcada como enviada. O lead passou a "Proposta enviada".');
      } else {
        await api(`/proposals/${proposal.id}`, { method: 'PATCH', body: { status } });
        toast.success(`Estado: ${PROPOSAL_STATUS_LABELS[status]}.`);
      }
      void qc.invalidateQueries({ queryKey: ['proposal', proposal.id] });
      void qc.invalidateQueries({ queryKey: ['proposals', lead.id] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function sendByEmail() {
    if (!proposal) return;
    const subject = `Proposta ${proposal.code} — ${lead.company_name}`;
    const hello = lead.contact_name ? `Olá ${lead.contact_name},` : 'Olá,';
    const body = `${hello}\n\nSegue em anexo a proposta para o novo site da ${lead.company_name}, com o que conversámos.\n\nTotal: ${formatCurrency(proposal.total)}${proposal.valid_until ? ` · válida até ${formatDate(proposal.valid_until)}` : ''}.\n\nFico ao dispor para qualquer dúvida.\n\nCumprimentos,`;
    log.mutate({ type: 'email_mailto', payload: { template: `Proposta ${proposal.code}` } });
    toast.info('Não te esqueças de anexar o PDF (descarrega-o primeiro).');
    window.location.href = mailtoUrl(lead.email, subject, body);
  }

  async function remove() {
    if (!proposal) return;
    try {
      await api(`/proposals/${proposal.id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['proposals', lead.id] });
      toast.success('Proposta apagada.');
      router.push(`/leads/${lead.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const pdfUrl = proposal ? `/api/v1/proposals/${proposal.id}/pdf` : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href={`/leads/${lead.id}`} className="hover:text-fg hover:underline">
            #{lead.number} {lead.company_name}
          </Link>
        }
        title={proposal ? `Proposta ${proposal.code}` : 'Nova proposta'}
        actions={
          proposal ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={PROPOSAL_TONES[proposal.status]}>{PROPOSAL_STATUS_LABELS[proposal.status]}</Badge>
              <a href={pdfUrl!} target="_blank" rel="noopener" className={buttonClasses('outline', 'sm')}>
                <FileText className="h-3.5 w-3.5" aria-hidden /> Ver PDF
              </a>
              <a href={`${pdfUrl}?download=1`} className={buttonClasses('outline', 'sm')}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Descarregar
              </a>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Apresentação" />
            <div className="flex flex-col gap-3 p-4">
              <Field label="Título" required error={errors.title?.[0]}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </Field>
              <Field
                label="Texto inicial"
                hint="Aparece no início do PDF. Linhas em branco separam parágrafos."
                error={errors.intro?.[0]}
              >
                <Textarea rows={9} value={intro} onChange={(e) => setIntro(e.target.value)} />
              </Field>
              <div>
                <Button size="sm" variant="ghost" onClick={suggestIntro} className="h-auto py-1.5 text-left whitespace-normal">
                  <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  {latestAudit ? 'Sugerir texto com a análise do site' : 'Sugerir texto com os problemas do lead'}
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Itens" description="Escolhe pacotes ou acrescenta itens à medida. Os preços podem ser ajustados." />
            <div className="flex flex-col gap-4 p-4">
              {packages?.length ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Acrescentar pacote">
                  {packages.map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="outline"
                      onClick={() => setItems((list) => [...list, toDraft(itemFromPackage(p, isRecurringPackage(p)))])}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden /> {p.name}
                      <span className="text-muted tabular">
                        {formatCurrency(p.price, { decimals: false })}
                        {isRecurringPackage(p) ? '/mês' : ''}
                      </span>
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setItems((list) => [
                        ...list,
                        { key: newKey(), name: '', description: '', features: '', price: '0', quantity: '1', recurring: false, package_id: null },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Item à medida
                  </Button>
                </div>
              ) : null}

              {errors.items?.[0] ? (
                <p role="alert" className="text-sm text-danger">
                  {errors.items[0]}
                </p>
              ) : null}
              {!items.length ? <p className="text-sm text-muted">Ainda não há itens.</p> : null}

              <ol className="flex flex-col gap-3" aria-label="Itens da proposta">
                {items.map((item, index) => (
                  <li key={item.key} className="rounded-lg border border-border p-3">
                    <fieldset className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_5rem]">
                      <legend className="sr-only">Item {index + 1}</legend>
                      <Field label="Nome" error={errors[`items.${index}.name`]?.[0]}>
                        <Input value={item.name} onChange={(e) => patchItem(item.key, { name: e.target.value })} />
                      </Field>
                      <Field label={item.recurring ? 'Preço (€/mês)' : 'Preço (€)'}>
                        <Input inputMode="decimal" value={item.price} onChange={(e) => patchItem(item.key, { price: e.target.value })} />
                      </Field>
                      <Field label="Qtd.">
                        <Input inputMode="numeric" value={item.quantity} onChange={(e) => patchItem(item.key, { quantity: e.target.value })} />
                      </Field>
                      <div className="sm:col-span-3">
                        <Field label="Descrição">
                          <Input value={item.description} onChange={(e) => patchItem(item.key, { description: e.target.value })} />
                        </Field>
                      </div>
                      <div className="sm:col-span-3">
                        <Field label="O que inclui (uma linha por ponto)">
                          <Textarea rows={4} value={item.features} onChange={(e) => patchItem(item.key, { features: e.target.value })} />
                        </Field>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={item.recurring}
                            onChange={(e) => patchItem(item.key, { recurring: e.target.checked })}
                            className="accent-[var(--accent)]"
                          />
                          Mensal (fora do total)
                        </label>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => move(item.key, -1)} disabled={index === 0} aria-label={`Subir item ${index + 1}`}>
                            <ArrowUp className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => move(item.key, 1)}
                            disabled={index === items.length - 1}
                            aria-label={`Descer item ${index + 1}`}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                            aria-label={`Remover ${item.name || `item ${index + 1}`}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          <Card>
            <CardHeader title="Condições" />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label="Válida até" hint={proposal ? undefined : 'Vazio = validade das Definições (30 dias).'}>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
              <Field label="Desconto (€)">
                <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Pagamento" hint={proposal ? undefined : 'Vazio = texto das Definições → Propostas.'}>
                  <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Notas (aparecem no PDF)">
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </div>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start" aria-label="Resumo da proposta">
          <Card>
            <CardHeader title="Resumo" as="h2" />
            <dl className="flex flex-col gap-1.5 p-4 text-sm">
              {totals.discount > 0 ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="tabular">{formatCurrency(totals.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Desconto</dt>
                    <dd className="tabular">−{formatCurrency(totals.discount)}</dd>
                  </div>
                </>
              ) : null}
              <div className={cn('flex justify-between text-base font-semibold', totals.discount > 0 && 'border-t border-border pt-2')}>
                <dt>Total</dt>
                <dd className="tabular text-accent-text" data-testid="proposal-total">
                  {formatCurrency(totals.total)}
                </dd>
              </div>
              {totals.monthly > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted">Mensalidade</dt>
                  <dd className="tabular">{formatCurrency(totals.monthly)}/mês</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex flex-col gap-2 border-t border-border p-4">
              <Button onClick={() => void save()} loading={saving}>
                {proposal ? 'Guardar alterações' : 'Criar proposta'}
              </Button>
              {proposal ? (
                <>
                  <Button variant="outline" onClick={sendByEmail}>
                    <Mail className="h-4 w-4" aria-hidden /> Enviar por email
                  </Button>
                  {proposal.status === 'rascunho' ? (
                    <Button variant="secondary" onClick={() => void setStatus('enviada')} loading={busy}>
                      <Send className="h-4 w-4" aria-hidden /> Marcar como enviada
                    </Button>
                  ) : null}
                  <Field label="Estado">
                    <Select value={proposal.status} onChange={(e) => void setStatus(e.target.value as ProposalStatus)} disabled={busy}>
                      {PROPOSAL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PROPOSAL_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Apagar proposta
                  </Button>
                </>
              ) : null}
            </div>
          </Card>
          {proposal ? (
            <p className="text-xs text-muted">
              Guarda as alterações antes de ver ou descarregar o PDF. O PDF usa a tua assinatura e os textos de Definições →
              Propostas.
            </p>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Apagar proposta?"
        description="A proposta e o PDF deixam de existir. Esta ação não pode ser desfeita."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Apagar
            </Button>
          </>
        }
      />
    </div>
  );
}

export function ProposalEditor({ leadId, proposalId }: { leadId: string; proposalId: string | null }) {
  const { data: lead, isLoading } = useLead(leadId);
  const { data: proposal, isLoading: loadingProposal } = useProposal(proposalId);
  if (isLoading || (proposalId && loadingProposal)) return <Skeleton className="mx-auto h-96 max-w-5xl" />;
  if (!lead) return <EmptyState title="Lead não encontrado" />;
  if (proposalId && !proposal) return <EmptyState title="Proposta não encontrada" />;
  return <Editor key={proposal?.updated_at ?? 'nova'} lead={lead} proposal={proposal ?? null} />;
}
