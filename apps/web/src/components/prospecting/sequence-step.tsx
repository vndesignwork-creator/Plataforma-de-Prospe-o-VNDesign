'use client';

/**
 * Sequência multicanal na Prospeção: o passo a fazer agora (canal e dia) com a
 * mensagem já preenchida — WhatsApp abre com o texto, email abre o envio,
 * ligar mostra o guião, redes sociais copia a mensagem.
 */
import {
  SEQUENCE_CHANNEL_KINDS,
  SEQUENCE_CHANNEL_LABELS,
  leadServiceCategory,
  renderTemplate,
  type ContactTemplate,
  type Lead,
  type ProspectingItem,
} from '@vndesign/core';
import { Copy, Mail, MessageCircle, MessagesSquare, Phone, Route } from 'lucide-react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { useServiceCatalog } from '@/components/services/services';
import { Button, buttonClasses } from '@/components/ui/button';
import { useTemplates } from '@/lib/queries';
import { useTemplateContext } from '@/lib/template-context';
import { telUrl, whatsappUrl } from '@/lib/utils';

const ICONS = { whatsapp: MessageCircle, email: Mail, call: Phone, dm: MessagesSquare } as const;

/** O modelo do passo: o escolhido nas definições ou o 1.º do canal (da categoria do lead, se houver). */
export function pickTemplate(templates: ContactTemplate[], step: NonNullable<ProspectingItem['sequence']>, category: string | null): ContactTemplate | null {
  if (step.template_id) {
    const chosen = templates.find((t) => t.id === step.template_id);
    if (chosen) return chosen;
  }
  for (const kind of SEQUENCE_CHANNEL_KINDS[step.channel]) {
    const ofKind = templates.filter((t) => t.kind === kind);
    const hit = ofKind.find((t) => category && t.category === category) ?? ofKind.find((t) => !t.category) ?? ofKind[0];
    if (hit) return hit;
  }
  return null;
}

export function SequenceStep({ lead, step }: { lead: Lead; step: NonNullable<ProspectingItem['sequence']> }) {
  const { data: templates } = useTemplates();
  const context = useTemplateContext(lead);
  const catalog = useServiceCatalog();
  const category = leadServiceCategory(lead.services, catalog.all) ?? null;
  const template = templates ? pickTemplate(templates, step, category) : null;
  const subject = template?.subject ? renderTemplate(template.subject, context).text : '';
  const body = template ? renderTemplate(template.body, context).text : '';
  const Icon = ICONS[step.channel];
  const wa = whatsappUrl(lead.phone, body || null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(subject ? `${subject}\n\n${body}` : body);
      toast.success('Mensagem copiada.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <section aria-label="Passo da sequência" className="flex flex-col gap-2 rounded-lg border border-accent/50 bg-accent-soft/30 p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Route className="h-4 w-4 text-accent-text" aria-hidden />
        <strong>
          Passo {step.step} de {step.total}: {SEQUENCE_CHANNEL_LABELS[step.channel]}
        </strong>
        <span className="text-muted">(dia {step.day})</span>
        {template ? <span className="text-xs text-muted">· {template.name}</span> : null}
      </p>
      {body ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-surface p-2.5 font-sans text-sm break-words whitespace-pre-wrap">
          {subject ? `${subject}\n\n` : ''}
          {body}
        </pre>
      ) : (
        <p className="text-sm text-muted">Sem modelo para este canal: cria um em Scripts ou escolhe-o em Definições → Follow-up e lembretes.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {step.channel === 'whatsapp' && wa ? (
          <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('primary', 'sm')}>
            <Icon className="h-3.5 w-3.5" aria-hidden /> Abrir no WhatsApp
          </a>
        ) : null}
        {step.channel === 'email' && lead.email ? (
          <SendEmailButton lead={lead} label="Enviar este email" subject={subject} body={body} template={template?.name ?? 'Sequência'} />
        ) : null}
        {step.channel === 'call' && lead.phone ? (
          <a href={telUrl(lead.phone)} className={buttonClasses('primary', 'sm')}>
            <Icon className="h-3.5 w-3.5" aria-hidden /> Ligar
          </a>
        ) : null}
        {body ? (
          <Button size="sm" variant="outline" onClick={() => void copy()}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
          </Button>
        ) : null}
      </div>
      {(step.channel === 'whatsapp' && !wa) || (step.channel === 'email' && !lead.email) || (step.channel === 'call' && !lead.phone) ? (
        <p className="text-xs text-warning">
          Falta o {step.channel === 'email' ? 'email' : 'telefone'} deste lead: usa “Procurar contacto” ou outro canal e regista “Contactado” na mesma.
        </p>
      ) : null}
      <p className="text-xs text-muted">Depois de enviar, carrega em “Contactado”: o próximo passo fica agendado para o dia certo.</p>
    </section>
  );
}
