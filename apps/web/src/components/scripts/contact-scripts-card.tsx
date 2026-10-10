'use client';

import {
  TEMPLATE_KIND_LABELS,
  TEMPLATE_KINDS,
  TEMPLATE_VARIABLES,
  mailtoUrl,
  renderTemplate,
  type ContactTemplate,
  type Lead,
  leadPath,
} from '@vndesign/core';
import { Copy, Mail, MessageSquareText, Phone, RotateCcw, Save, Send } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useLogActivity, useTemplates, useUpdateLead } from '@/lib/queries';
import { EMAIL_KINDS, useTemplateContext } from '@/lib/template-context';

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
  proposal_structure: { activity: 'template_used', channel: null },
};

/** Escolhe o modelo inicial: email frio do setor do lead, senão o predefinido. */
function initialTemplate(templates: ContactTemplate[], lead: Lead): ContactTemplate | undefined {
  const firstKind = lead.status === 'identificado' ? 'cold_email' : 'follow_up';
  return (
    templates.find((t) => t.kind === firstKind && t.sector_id === lead.sector_id && lead.sector_id) ??
    templates.find((t) => t.kind === firstKind && t.is_default) ??
    templates.find((t) => t.kind === firstKind) ??
    templates[0]
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Ficha do lead: escolher modelo → pré-visualização preenchida → editar → copiar/enviar. */
export function ContactScriptsCard({ lead }: { lead: Lead }) {
  const { data: templates } = useTemplates();
  const context = useTemplateContext(lead);
  const log = useLogActivity(lead.id);
  const update = useUpdateLead(lead.id);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);

  const template = useMemo(() => {
    if (!templates?.length) return undefined;
    return templates.find((t) => t.id === templateId) ?? initialTemplate(templates, lead);
  }, [templates, templateId, lead]);

  const rendered = useMemo(() => {
    if (!template) return null;
    const subject = renderTemplate(template.subject, context);
    const body = renderTemplate(template.body, context);
    return {
      subject: subject.text,
      body: body.text,
      missing: [...new Set([...subject.missing, ...body.missing])],
    };
  }, [template, context]);

  if (!templates) return null;
  if (!template || !rendered) {
    return (
      <Card>
        <CardHeader title="Scripts de contacto" />
        <p className="p-4 text-sm text-muted">
          Ainda não há modelos. <Link href="/scripts" className="text-accent-text underline">Criar um modelo</Link>
        </p>
      </Card>
    );
  }

  const isEmail = EMAIL_KINDS.has(template.kind);
  const subject = draft?.subject ?? rendered.subject;
  const body = draft?.body ?? rendered.body;
  const edited = draft !== null;
  const payload = { template: template.name, template_id: template.id };

  async function onCopy() {
    const text = isEmail && subject ? `${subject}\n\n${body}` : body;
    if (await copy(text)) {
      toast.success('Copiado.');
      log.mutate({ type: 'email_copied', payload: { ...payload, part: 'all' } });
    } else {
      toast.error('Não foi possível copiar. Seleciona o texto e copia manualmente.');
    }
  }

  function onMailto() {
    log.mutate({ type: 'email_mailto', payload });
    if (!lead.email) toast.info('Este lead não tem email: escreve o destinatário no teu programa de email.');
    window.location.href = mailtoUrl(lead.email, subject, body);
  }

  async function onSaveToLead() {
    try {
      await update.mutateAsync({ email_subject: subject || null, email_body: body });
      toast.success('Guardado como email de prospeção do lead.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onMarkSent() {
    try {
      const sent = SENT_AS[template!.kind] ?? { activity: 'template_used', channel: null };
      await log.mutateAsync({ type: sent.activity, body: isEmail ? subject || undefined : undefined, payload });
      if (lead.status === 'identificado' && template!.kind !== 'proposal_structure') {
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

  return (
    <Card>
      <CardHeader
        title="Scripts de contacto"
        description="Modelo preenchido com os dados deste lead — edita à vontade antes de copiar ou enviar."
        actions={
          <Link href="/scripts" className="text-sm text-accent-text hover:underline">
            Gerir modelos
          </Link>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="script-template" className="text-sm font-medium">
            Modelo
          </label>
          <Select
            id="script-template"
            value={template.id}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setDraft(null);
            }}
            className="h-9 w-auto min-w-64 flex-1"
          >
            {TEMPLATE_KINDS.map((kind) => {
              const group = templates.filter((t) => t.kind === kind);
              if (!group.length) return null;
              return (
                <optgroup key={kind} label={TEMPLATE_KIND_LABELS[kind]}>
                  {group.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
          {edited ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Repor modelo
            </Button>
          ) : null}
        </div>

        {rendered.missing.length ? (
          <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            Sem dados para: {rendered.missing.map((m) => VAR_LABEL[m] ?? m).join(', ')}. Preenche na ficha ou ajusta o texto.
          </p>
        ) : null}

        {isEmail ? (
          <div>
            <label htmlFor="script-subject" className="mb-1 block text-sm font-medium">
              Assunto
            </label>
            <Input
              id="script-subject"
              value={subject}
              onChange={(e) => setDraft({ subject: e.target.value, body })}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="script-body" className="mb-1 block text-sm font-medium">
            {isEmail ? 'Mensagem' : template.kind === 'call_script' ? 'Guião' : 'Texto'}
          </label>
          <Textarea
            id="script-body"
            rows={12}
            value={body}
            onChange={(e) => setDraft({ subject, body: e.target.value })}
            className="leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
          </Button>
          {isEmail ? (
            <Button size="sm" variant="outline" onClick={onMailto}>
              <Mail className="h-3.5 w-3.5" aria-hidden /> Abrir no email
            </Button>
          ) : null}
          {isEmail ? (
            <Button size="sm" variant="outline" onClick={onSaveToLead} loading={update.isPending}>
              <Save className="h-3.5 w-3.5" aria-hidden /> Guardar como email de prospeção
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onMarkSent} loading={log.isPending}>
            {isEmail ? <Send className="h-3.5 w-3.5" aria-hidden /> : template.kind === 'call_script' ? <Phone className="h-3.5 w-3.5" aria-hidden /> : <MessageSquareText className="h-3.5 w-3.5" aria-hidden />}
            {isEmail ? 'Marcar como enviado' : template.kind === 'call_script' ? 'Registar chamada' : 'Marcar como enviado'}
          </Button>
        </div>
        {isEmail && !lead.email ? (
          <p className="text-xs text-muted">
            Este lead não tem email — “Abrir no email” abre a mensagem sem destinatário.{' '}
            <Link href={leadPath(lead, '/editar')} className="text-accent-text underline">
              Acrescentar email
            </Link>
          </p>
        ) : null}
        {lead.status === 'identificado' ? (
          <p className="text-xs text-muted">Ao marcar como enviado, o lead passa a “Contactado” e o follow-up fica agendado.</p>
        ) : null}
      </div>
    </Card>
  );
}
