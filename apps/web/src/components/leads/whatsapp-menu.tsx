'use client';

/**
 * Botão WhatsApp da ficha: abre a conversa já com uma mensagem pronta
 * (primeiro contacto, follow-up, lembrete de reunião…). As mensagens são os
 * modelos do tipo "WhatsApp" em Scripts, preenchidos com os dados do lead.
 */
import { leadServiceCategory, rankTemplatesForLead, renderTemplate, templateVariablesIn, type Lead } from '@vndesign/core';
import { ChevronDown, MessageCircle, MessageCircleMore, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useServiceCatalog } from '@/components/services/services';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { errorMessage } from '@/lib/api-client';
import { useLogActivity, useMeetings, useSettings, useTemplates, useUpdateLead } from '@/lib/queries';
import { useTemplateContext } from '@/lib/template-context';
import { whatsappUrl } from '@/lib/utils';

/** "WhatsApp — primeiro contacto" → "Primeiro contacto" (o menu já diz que é WhatsApp). */
function shortName(name: string): string {
  const short = name.replace(/^WhatsApp\s*[—–-]\s*/i, '');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export function WhatsAppMenu({ lead, className }: { lead: Lead; className?: string }) {
  if (!whatsappUrl(lead.phone)) return null;
  return (
    <DropdownRoot>
      <DropdownTrigger className={className}>
        <MessageCircle className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
        WhatsApp
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted max-sm:hidden" aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="start" className="max-w-80">
        <WhatsAppMessages lead={lead} />
      </DropdownContent>
    </DropdownRoot>
  );
}

/**
 * O conteúdo do menu só existe com o menu aberto: as reuniões e o resto das
 * variáveis só são pedidos nessa altura (na página Projetos há um botão por projeto).
 */
function WhatsAppMessages({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { data: templates } = useTemplates();
  const { data: settings } = useSettings();
  const { data: meetings } = useMeetings(lead.id, !!settings?.features.meetings);
  const catalog = useServiceCatalog();
  const log = useLogActivity(lead.id);
  const update = useUpdateLead(lead.id);
  // Hora fixa ao abrir o menu (para escolher a próxima reunião).
  const [now] = useState(() => Date.now());
  const nextMeeting =
    (meetings ?? [])
      .filter((m) => !m.canceled_at && new Date(m.starts_at).getTime() >= now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
  const context = useTemplateContext(lead, nextMeeting);
  const category = leadServiceCategory(lead.services, catalog.all);
  const messages = rankTemplatesForLead((templates ?? []).filter((t) => t.kind === 'whatsapp'), lead, category);
  const plain = whatsappUrl(lead.phone)!;

  async function markContacted() {
    try {
      const updated = await update.mutateAsync({ status: 'contactado', channel: lead.channel ?? 'whatsapp' });
      toast.success(
        `Estado: Contactado${updated.next_action_on ? ` — follow-up a ${updated.next_action_on.split('-').reverse().join('/')}` : ''}.`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function open(template: { id: string; name: string; body: string }) {
    const text = renderTemplate(template.body, context).text;
    window.open(whatsappUrl(lead.phone, text) ?? plain, '_blank', 'noopener,noreferrer');
    log.mutate({ type: 'template_used', payload: { template: template.name, template_id: template.id, via: 'whatsapp' } });
    if (lead.status === 'identificado') {
      toast.success('Mensagem aberta no WhatsApp. Depois de a enviares, marca o lead como contactado.', {
        action: { label: 'Marcar como contactado', onClick: () => void markContacted() },
        duration: 15000,
      });
    } else {
      toast.success('Mensagem aberta no WhatsApp (fica registada na linha do tempo).');
    }
  }

  return (
    <>
      <DropdownLabel>Mensagem pronta</DropdownLabel>
      {messages.map((t) => {
        // Mensagens que precisam de dados que ainda não existem ficam desativadas, com o motivo.
        const vars = templateVariablesIn(t.body);
        const blocked = vars.includes('reuniao') && !nextMeeting
          ? 'Sem reunião marcada'
          : vars.includes('avaliacao') && !context.avaliacao
            ? 'Falta o link de avaliação (Definições → Funcionalidades)'
            : null;
        return (
          <DropdownItem key={t.id} onSelect={() => open(t)} disabled={!!blocked}>
            <MessageCircleMore className="h-4 w-4 text-accent-text" aria-hidden />
            <span className="min-w-0">
              <span className="block">{shortName(t.name)}</span>
              {blocked ? <span className="block text-xs text-muted">{blocked}</span> : null}
            </span>
          </DropdownItem>
        );
      })}
      {!messages.length ? <p className="px-2.5 py-1.5 text-sm text-muted">Ainda não tens mensagens de WhatsApp.</p> : null}
      <DropdownSeparator />
      <DropdownItem onSelect={() => window.open(plain, '_blank', 'noopener,noreferrer')}>
        <MessageCircle className="h-4 w-4 text-muted" aria-hidden /> Abrir a conversa sem mensagem
      </DropdownItem>
      <DropdownItem onSelect={() => router.push('/scripts')}>
        <Pencil className="h-4 w-4 text-muted" aria-hidden /> Editar as mensagens (Scripts)
      </DropdownItem>
    </>
  );
}
