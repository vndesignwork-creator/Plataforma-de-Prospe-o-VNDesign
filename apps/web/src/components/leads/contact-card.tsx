'use client';

/**
 * Contactar (ficha do lead e sessão de prospeção): um só sítio para escrever e
 * enviar — por email, WhatsApp ou telefone. O texto parte de um modelo, do email
 * guardado do lead ou da IA, e há uma só barra de botões. "Guardar" faz do texto
 * o email de prospeção do lead (o 1.º email da sessão de prospeção).
 */
import {
  AI_EMAIL_KINDS,
  AI_EMAIL_KIND_LABELS,
  AI_EMAIL_LENGTHS,
  AI_EMAIL_LENGTH_LABELS,
  AI_EMAIL_TONES,
  AI_EMAIL_TONE_LABELS,
  TEMPLATE_KIND_LABELS,
  TEMPLATE_KINDS,
  TEMPLATE_VARIABLES,
  leadServiceCategory,
  mailtoUrl,
  rankTemplatesForLead,
  renderTemplate,
  serviceLabel,
  toPlainText,
  toRichHtml,
  type AiEmailKind,
  type AiEmailLength,
  type AiEmailTone,
  type ContactTemplate,
  type Lead,
} from '@vndesign/core';
import { Check, Copy, Mail, MessageCircle, MessageSquareText, Phone, RefreshCw, RotateCcw, Save, Send, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { useServiceCatalog, useServiceFilterOptions } from '@/components/services/services';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { CollapseButton, useProspectingCollapsed } from '@/components/ui/collapse';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { errorMessage } from '@/lib/api-client';
import { useAiEmail, useLogActivity, useSettings, useTemplates, useUpdateLead } from '@/lib/queries';
import { EMAIL_KINDS, useTemplateContext } from '@/lib/template-context';
import { cn, whatsappUrl } from '@/lib/utils';
import { MultiSelectFilter } from './multi-select';

const VAR_LABEL = Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.label]));

/** Tipo de atividade e canal registados ao marcar como enviado, por tipo de modelo. */
const SENT_AS: Record<string, { activity: 'email_sent' | 'call_logged' | 'template_used'; channel: Lead['channel'] }> = {
  cold_email: { activity: 'email_sent', channel: 'email' },
  follow_up: { activity: 'email_sent', channel: 'email' },
  general_email: { activity: 'email_sent', channel: 'email' },
  call_script: { activity: 'call_logged', channel: 'telefone' },
  social_dm: { activity: 'template_used', channel: 'instagram' },
  linkedin: { activity: 'template_used', channel: 'linkedin' },
  short_message: { activity: 'template_used', channel: 'outro' },
  whatsapp: { activity: 'template_used', channel: 'whatsapp' },
  proposal_structure: { activity: 'template_used', channel: null },
};
const EMAIL_SENT = SENT_AS.cold_email!;

/** De onde vem o texto: o email guardado do lead, um modelo ou a IA. */
type Source = { type: 'saved' } | { type: 'template'; id: string } | { type: 'ai' };
const SAVED_VALUE = 'guardado';
const AI_VALUE = 'ia';

/** Modelo inicial: email frio (ou follow-up) mais adequado ao lead. */
function initialTemplate(templates: ContactTemplate[], lead: Lead, category: string | null): ContactTemplate | undefined {
  const firstKind = lead.status === 'identificado' ? 'cold_email' : 'follow_up';
  return rankTemplatesForLead(templates.filter((t) => t.kind === firstKind), lead, category)[0] ?? templates[0];
}

/** Tipo de email com IA sugerido pelo estado do lead. */
function defaultAiKind(lead: Lead): AiEmailKind {
  if (lead.status === 'contactado' || lead.status === 'proposta_enviada') return 'follow_up';
  if (lead.status === 'reuniao') return 'envio_proposta';
  return 'primeiro_contacto';
}

/** Copia com a formatação (para colar no Gmail/Outlook) e em texto simples (para o resto). */
async function copyText(text: string, html?: string) {
  try {
    if (html && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

/** Painel "Escrever com IA": as opções e o botão Gerar; o resultado vai para o editor. */
function AiPanel({ lead, onGenerated, onClose }: { lead: Lead; onGenerated: (email: { subject: string; body: string }) => void; onClose: () => void }) {
  const serviceOptions = useServiceFilterOptions();
  const catalog = useServiceCatalog();
  const { data: settings } = useSettings();
  const generate = useAiEmail(lead.id);
  const [kind, setKind] = useState<AiEmailKind>(() => defaultAiKind(lead));
  const [tone, setTone] = useState<AiEmailTone>('proximo');
  const [length, setLength] = useState<AiEmailLength>('curto');
  const [useAudit, setUseAudit] = useState(true);
  const [instructions, setInstructions] = useState('');
  // Serviços a propor: por omissão, os de interesse do lead (vazio = um site).
  const [services, setServices] = useState<string[]>(() => [...(lead.services ?? [])]);
  const [generated, setGenerated] = useState(false);

  if (settings?.ai_configured === false) {
    return (
      <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
        A escrita com IA ainda não está ativa: falta configurar um fornecedor de IA em Definições → Inteligência artificial.
      </p>
    );
  }

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await generate.mutateAsync({ kind, tone, length, use_audit: useAudit, instructions: instructions.trim() || undefined, services });
      onGenerated({ subject: result.subject, body: result.body });
      setGenerated(true);
      toast.success('Email gerado. Revê e ajusta antes de enviar.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={onGenerate} className="grid gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-3" aria-label="Opções do email com IA">
      <div className="flex items-center justify-between gap-2 sm:col-span-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-accent-text" aria-hidden /> Escrever com IA
        </p>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Fechar a escrita com IA" title="Fechar">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <Field label="Tipo de email">
        <Select value={kind} onChange={(e) => setKind(e.target.value as AiEmailKind)}>
          {AI_EMAIL_KINDS.map((k) => (
            <option key={k} value={k}>
              {AI_EMAIL_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tom">
        <Select value={tone} onChange={(e) => setTone(e.target.value as AiEmailTone)}>
          {AI_EMAIL_TONES.map((t) => (
            <option key={t} value={t}>
              {AI_EMAIL_TONE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tamanho">
        <Select value={length} onChange={(e) => setLength(e.target.value as AiEmailLength)}>
          {AI_EMAIL_LENGTHS.map((l) => (
            <option key={l} value={l}>
              {AI_EMAIL_LENGTH_LABELS[l]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <MultiSelectFilter label="Serviços a propor" value={services} onChange={setServices} options={serviceOptions.filter((o) => o.value !== 'none')} />
        <span className="text-sm text-muted">{services.length ? services.map((s) => serviceLabel(s, catalog.all)).join(', ') : 'Um site (por omissão)'}</span>
      </div>
      <div className="sm:col-span-3">
        <Field label="Indicações (opcional)" hint="Ex.: “mencionar que também sou da Amadora” ou “focar nas reservas online”.">
          <Textarea rows={2} maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={useAudit} onChange={(e) => setUseAudit(e.target.checked)} className="accent-[var(--accent)]" />
        Usar os problemas da última análise do site
      </label>
      <div className="flex items-center justify-end gap-2">
        <span aria-live="polite" className="text-xs text-muted">
          {generate.isPending ? 'A escrever… (10 a 30 s)' : ''}
        </span>
        <Button type="submit" size="sm" loading={generate.isPending}>
          {generated ? <RefreshCw className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {generated ? 'Gerar outra versão' : 'Gerar email'}
        </Button>
      </div>
    </form>
  );
}

export function ContactCard({ lead }: { lead: Lead }) {
  const { data: templates } = useTemplates();
  const context = useTemplateContext(lead);
  const log = useLogActivity(lead.id);
  const update = useUpdateLead(lead.id);
  const catalog = useServiceCatalog();
  const category = leadServiceCategory(lead.services, catalog.all);
  const hasSaved = !!(lead.email_body || lead.email_subject);
  // Com email guardado, começa por ele (é o que vai ser enviado); senão, pelo modelo mais adequado.
  const [source, setSource] = useState<Source | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiEmail, setAiEmail] = useState<{ subject: string; body: string } | null>(null);
  const [collapsed, setCollapsed] = useProspectingCollapsed('contactar', lead.status);

  const current = useMemo<Source | null>(() => source ?? (hasSaved ? { type: 'saved' } : null), [source, hasSaved]);
  const template = useMemo(() => {
    if (!templates?.length) return undefined;
    if (current?.type === 'template') return templates.find((t) => t.id === current.id);
    if (current) return undefined;
    return initialTemplate(templates, lead, category);
  }, [templates, current, lead, category]);

  const base = useMemo(() => {
    if (current?.type === 'saved') return { subject: lead.email_subject ?? '', body: lead.email_body ?? '', missing: [] as string[] };
    if (current?.type === 'ai') return aiEmail ? { ...aiEmail, missing: [] as string[] } : null;
    if (!template) return null;
    const subject = renderTemplate(template.subject, context);
    const body = renderTemplate(template.body, context);
    // WhatsApp e chamada: sempre texto simples (um modelo pode ter mudado de tipo depois de formatado).
    const text = EMAIL_KINDS.has(template.kind) ? body.text : toPlainText(body.text);
    return { subject: subject.text, body: text, missing: [...new Set([...subject.missing, ...body.missing])] };
  }, [current, template, context, aiEmail, lead.email_subject, lead.email_body]);

  if (lead.anonymized_at || !templates) return null;

  const kind = current?.type === 'saved' || current?.type === 'ai' ? 'cold_email' : (template?.kind ?? 'cold_email');
  const isEmail = EMAIL_KINDS.has(kind);
  const canWhatsApp = ['whatsapp', 'short_message'].includes(kind) && !!whatsappUrl(lead.phone);
  const subject = draft?.subject ?? base?.subject ?? '';
  const body = draft?.body ?? base?.body ?? '';
  const edited = draft !== null;
  const sourceName = current?.type === 'saved' ? 'Email de prospeção' : current?.type === 'ai' ? 'Email com IA' : (template?.name ?? '');
  const payload = current?.type === 'template' || (!current && template) ? { template: template!.name, template_id: template!.id } : { template: sourceName };
  // Compara pelo HTML normalizado (o email guardado pode estar em texto simples).
  const savedNow = hasSaved && subject === (lead.email_subject ?? '') && toRichHtml(body) === toRichHtml(lead.email_body);
  const selectValue = current?.type === 'saved' ? SAVED_VALUE : current?.type === 'ai' ? AI_VALUE : (template?.id ?? '');

  function choose(value: string) {
    setDraft(null);
    if (value === SAVED_VALUE) setSource({ type: 'saved' });
    else if (value === AI_VALUE) setSource({ type: 'ai' });
    else setSource({ type: 'template', id: value });
  }

  async function onCopy() {
    const plain = isEmail ? toPlainText(body) : body;
    const text = isEmail && subject ? `${subject}\n\n${plain}` : plain;
    if (await copyText(text, isEmail ? toRichHtml(body) : undefined)) {
      toast.success('Copiado.');
      log.mutate({ type: 'email_copied', payload: { ...payload, part: 'all' } });
    } else {
      toast.error('Não foi possível copiar. Seleciona o texto e copia manualmente.');
    }
  }

  function onMailto() {
    log.mutate({ type: 'email_mailto', payload });
    if (!lead.email) toast.info('Este lead não tem email: escreve o destinatário no teu programa de email.');
    window.location.href = mailtoUrl(lead.email, subject, toPlainText(body));
  }

  function onWhatsApp() {
    window.open(whatsappUrl(lead.phone, body)!, '_blank', 'noopener,noreferrer');
    log.mutate({ type: 'template_used', payload: { ...payload, via: 'whatsapp' } });
    toast.success('Mensagem aberta no WhatsApp. Depois de a enviares, usa “Marcar como enviado”.');
  }

  async function onSave() {
    try {
      await update.mutateAsync({ email_subject: subject || null, email_body: body });
      // O texto guardado passa a ser o ponto de partida.
      setSource({ type: 'saved' });
      setDraft(null);
      toast.success('Guardado como email de prospeção do lead.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onMarkSent() {
    try {
      const sent = isEmail ? EMAIL_SENT : (SENT_AS[kind] ?? { activity: 'template_used' as const, channel: null });
      await log.mutateAsync({ type: sent.activity, body: isEmail ? subject || undefined : undefined, payload });
      if (lead.status === 'identificado' && kind !== 'proposal_structure') {
        const updated = await update.mutateAsync({ status: 'contactado', channel: lead.channel ?? sent.channel });
        toast.success(
          `Registado. Estado: Contactado${updated.next_action_on ? ` — follow-up a ${updated.next_action_on.split('-').reverse().join('/')}` : ''}.`,
        );
      } else {
        toast.success('Registado na linha do tempo.');
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const description = collapsed
    ? hasSaved
      ? `Email guardado: ${lead.email_subject ?? '(sem assunto)'}`
      : `A partir de: ${sourceName}`
    : 'Email, WhatsApp ou chamada com os dados deste lead: parte de um modelo, do email guardado ou da IA, ajusta e envia.';

  return (
    <Card id="contactar" role="region" aria-label="Contactar" className="scroll-mt-20">
      <CardHeader
        title="Contactar"
        description={<span className={collapsed ? 'line-clamp-1' : undefined}>{description}</span>}
        actions={
          <>
            <Link href="/scripts" className="text-sm text-accent-text hover:underline">
              Gerir modelos
            </Link>
            <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label="Contactar" />
          </>
        }
        className={collapsed ? 'border-b-0' : undefined}
      />
      <div className={cn('flex flex-col gap-3 p-4', collapsed && 'hidden')}>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="script-template" className="text-sm font-medium">
            Partir de
          </label>
          <Select id="script-template" value={selectValue} onChange={(e) => choose(e.target.value)} className="h-9 w-auto min-w-56 flex-1">
            {hasSaved || current?.type === 'ai' ? (
              <optgroup label="Deste lead">
                {hasSaved ? <option value={SAVED_VALUE}>Email de prospeção guardado</option> : null}
                {current?.type === 'ai' ? <option value={AI_VALUE}>Email escrito com IA</option> : null}
              </optgroup>
            ) : null}
            {TEMPLATE_KINDS.map((k) => {
              const group = rankTemplatesForLead(templates.filter((t) => t.kind === k), lead, category);
              if (!group.length) return null;
              return (
                <optgroup key={k} label={TEMPLATE_KIND_LABELS[k]}>
                  {group.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
          <Button size="sm" variant={aiOpen ? 'secondary' : 'outline'} onClick={() => setAiOpen(!aiOpen)} aria-expanded={aiOpen}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Escrever com IA
          </Button>
          {edited ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} title="Voltar ao texto original">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Repor
            </Button>
          ) : null}
        </div>

        {aiOpen ? (
          <AiPanel
            lead={lead}
            onClose={() => setAiOpen(false)}
            onGenerated={(email) => {
              setAiEmail(email);
              setSource({ type: 'ai' });
              setDraft(null);
            }}
          />
        ) : null}

        {!base ? (
          <p className="text-sm text-muted">
            Ainda não há modelos. <Link href="/scripts" className="text-accent-text underline">Criar um modelo</Link> ou escreve com IA.
          </p>
        ) : (
          <>
            {base.missing.length ? (
              <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                Sem dados para: {base.missing.map((m) => VAR_LABEL[m] ?? m).join(', ')}. Preenche na ficha ou ajusta o texto.
              </p>
            ) : null}

            {isEmail ? (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="script-subject" className="text-sm font-medium">
                    Assunto
                  </label>
                  {savedNow ? (
                    <Badge tone="success">
                      <Check className="h-3 w-3" aria-hidden /> Email guardado
                    </Badge>
                  ) : hasSaved ? (
                    <span className="text-xs text-muted">Diferente do email guardado</span>
                  ) : null}
                </div>
                <Input id="script-subject" value={subject} onChange={(e) => setDraft({ subject: e.target.value, body })} />
              </div>
            ) : null}
            <div>
              <label htmlFor="script-body" className="mb-1 block text-sm font-medium">
                {isEmail ? 'Mensagem' : kind === 'call_script' ? 'Guião' : 'Texto'}
              </label>
              {isEmail ? (
                <RichTextEditor id="script-body" label="Mensagem" value={body} onChange={(html) => setDraft({ subject, body: html })} />
              ) : (
                <Textarea id="script-body" rows={12} value={body} onChange={(e) => setDraft({ subject, body: e.target.value })} className="leading-relaxed" />
              )}
              {current?.type === 'ai' ? <p className="mt-1 text-xs text-muted">Revê sempre antes de enviar: a IA pode enganar-se.</p> : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {isEmail ? <SendEmailButton lead={lead} subject={subject} body={body} template={sourceName} onSent={() => setDraft(null)} /> : null}
              {canWhatsApp ? (
                <Button size="sm" onClick={onWhatsApp}>
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Abrir no WhatsApp
                </Button>
              ) : null}
              <Button size="sm" variant={isEmail || canWhatsApp ? 'outline' : 'primary'} onClick={onCopy}>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
              </Button>
              {isEmail ? (
                <Button size="sm" variant="outline" onClick={onMailto}>
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Abrir no email
                </Button>
              ) : null}
              {isEmail ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSave}
                  loading={update.isPending}
                  disabled={savedNow}
                  aria-label="Guardar como email de prospeção"
                  title="Guardar como email de prospeção do lead (o 1.º email da sessão de prospeção)"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden /> Guardar
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={onMarkSent} loading={log.isPending}>
                {isEmail ? (
                  <Send className="h-3.5 w-3.5" aria-hidden />
                ) : kind === 'call_script' ? (
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                )}
                {kind === 'call_script' ? 'Registar chamada' : 'Marcar como enviado'}
              </Button>
            </div>
            {isEmail && !lead.email ? (
              <p className="text-right text-xs text-muted">Este lead não tem email — “Abrir no email” abre a mensagem sem destinatário.</p>
            ) : null}
            {lead.status === 'identificado' ? (
              <p className="text-right text-xs text-muted">Ao marcar como enviado, o lead passa a “Contactado” e o follow-up fica agendado.</p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
