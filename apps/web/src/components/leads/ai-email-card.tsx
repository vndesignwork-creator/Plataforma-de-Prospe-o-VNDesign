'use client';

import {
  AI_EMAIL_KINDS,
  AI_EMAIL_KIND_LABELS,
  AI_EMAIL_LENGTHS,
  AI_EMAIL_LENGTH_LABELS,
  AI_EMAIL_TONES,
  AI_EMAIL_TONE_LABELS,
  mailtoUrl,
  serviceLabel,
  type AiEmailKind,
  type AiEmailLength,
  type AiEmailTone,
  type Lead,
  type ServiceKey,
} from '@vndesign/core';
import { Copy, Mail, RefreshCw, Save, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { MultiSelectFilter } from './multi-select';
import { serviceFilterOptions } from '@/components/services/services';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useAiEmail, useLogActivity, useSettings, useUpdateLead } from '@/lib/queries';

/** Tipo de email sugerido pelo estado do lead. */
function defaultKind(lead: Lead): AiEmailKind {
  if (lead.status === 'contactado' || lead.status === 'proposta_enviada') return 'follow_up';
  if (lead.status === 'reuniao') return 'envio_proposta';
  return 'primeiro_contacto';
}

export function AiEmailCard({ lead }: { lead: Lead }) {
  const { data: settings } = useSettings();
  const generate = useAiEmail(lead.id);
  const update = useUpdateLead(lead.id);
  const log = useLogActivity(lead.id);
  const [kind, setKind] = useState<AiEmailKind>(() => defaultKind(lead));
  const [tone, setTone] = useState<AiEmailTone>('proximo');
  const [length, setLength] = useState<AiEmailLength>('curto');
  const [useAudit, setUseAudit] = useState(true);
  const [instructions, setInstructions] = useState('');
  // Serviços a propor: por omissão, os de interesse do lead (vazio = um site).
  const [services, setServices] = useState<string[]>(() => [...(lead.services ?? [])]);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);

  if (lead.anonymized_at) return null;

  async function onGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    try {
      const result = await generate.mutateAsync({
        kind,
        tone,
        length,
        use_audit: useAudit,
        instructions: instructions.trim() || undefined,
        services: services as ServiceKey[],
      });
      setDraft({ subject: result.subject, body: result.body });
      toast.success('Email gerado. Revê e ajusta antes de enviar.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      toast.success('Copiado.');
      log.mutate({ type: 'email_copied', payload: { template: 'Email com IA', part: 'all' } });
    } catch {
      toast.error('Não foi possível copiar. Seleciona o texto e copia manualmente.');
    }
  }

  function onMailto() {
    if (!draft) return;
    log.mutate({ type: 'email_mailto', payload: { template: 'Email com IA' } });
    if (!lead.email) toast.info('Este lead não tem email: escreve o destinatário no teu programa de email.');
    window.location.href = mailtoUrl(lead.email, draft.subject, draft.body);
  }

  async function onSave() {
    if (!draft) return;
    try {
      await update.mutateAsync({ email_subject: draft.subject || null, email_body: draft.body });
      toast.success('Guardado como email de prospeção do lead.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const configured = settings?.ai_configured !== false;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-text" aria-hidden /> Escrever com IA
          </span>
        }
        description="O Claude escreve um email com os dados deste lead, a análise do site e os argumentos do setor."
      />
      {!configured ? (
        <p className="p-4 text-sm text-muted">
          O gerador com IA ainda não está ativo: falta a variável <code>ANTHROPIC_API_KEY</code> no servidor (ver README).
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <form onSubmit={onGenerate} className="grid gap-3 sm:grid-cols-3" aria-label="Opções do email com IA">
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
              <MultiSelectFilter
                label="Serviços a propor"
                value={services}
                onChange={setServices}
                options={serviceFilterOptions().filter((o) => o.value !== 'none')}
              />
              <span className="text-sm text-muted">
                {services.length ? services.map(serviceLabel).join(', ') : 'Um site (por omissão)'}
              </span>
            </div>
            <div className="sm:col-span-3">
              <Field label="Indicações (opcional)" hint="Ex.: “mencionar que também sou da Amadora” ou “focar nas reservas online”.">
                <Textarea rows={2} maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={useAudit}
                onChange={(e) => setUseAudit(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Usar os problemas da última análise do site
            </label>
            <div className="sm:text-right">
              <Button type="submit" size="sm" loading={generate.isPending}>
                {draft ? <RefreshCw className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                {draft ? 'Gerar outra versão' : 'Gerar email'}
              </Button>
            </div>
          </form>

          <p aria-live="polite" className="text-sm text-muted">
            {generate.isPending ? 'A escrever o email… (10 a 30 segundos)' : ''}
          </p>

          {draft ? (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <Field label="Assunto">
                <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </Field>
              <Field label="Mensagem" hint="Revê sempre antes de enviar: a IA pode enganar-se.">
                <Textarea
                  rows={14}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  className="leading-relaxed"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={onCopy}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                </Button>
                <Button size="sm" variant="outline" onClick={onMailto}>
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Abrir no email
                </Button>
                <Button size="sm" variant="outline" onClick={onSave} loading={update.isPending}>
                  <Save className="h-3.5 w-3.5" aria-hidden /> Guardar como email de prospeção
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
