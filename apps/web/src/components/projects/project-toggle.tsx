'use client';

/**
 * "Concluir projeto" / "Reabrir projeto" (clientes). Ao concluir abre os
 * passos finais: tarefa "Juntar ao portefólio", lembrete para propor um novo
 * serviço daqui a uns meses e, no fim, pedir uma avaliação no Google
 * (mensagem pronta por WhatsApp ou email).
 */
import { useQueryClient } from '@tanstack/react-query';
import { UPSELL_MONTHS, renderTemplate, templateVariablesIn, type Lead } from '@vndesign/core';
import { CheckCircle2, MessageCircle, RotateCcw, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useLogActivity, useMe, useSetProjectCompleted, useSettings, useTemplates, type SettingsWithMail } from '@/lib/queries';
import { useTemplateContext } from '@/lib/template-context';
import { whatsappUrl } from '@/lib/utils';

/** Pedir a avaliação: modelos com {{avaliacao}} (WhatsApp e email). */
function ReviewRequest({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: me } = useMe();
  const { data: templates } = useTemplates();
  const context = useTemplateContext(lead);
  const log = useLogActivity(lead.id);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const withReview = (templates ?? []).filter((t) => templateVariablesIn(t.body).includes('avaliacao'));
  const waTemplate = withReview.find((t) => t.kind === 'whatsapp');
  const emailTemplate = withReview.find((t) => t.kind !== 'whatsapp' && t.subject);
  const canEdit = me?.role !== 'member';

  async function saveLink() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api<{ data: SettingsWithMail }>('/settings', { method: 'PATCH', body: { google_review_url: link } });
      qc.setQueryData(['settings'], data);
      toast.success('Link de avaliação guardado (fica para os próximos clientes).');
    } catch (e) {
      if (e instanceof ApiClientError && e.problem.errors) setError((e.problem.errors as Record<string, string[]>).google_review_url?.[0] ?? 'Link inválido.');
      else toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!settings?.google_review_url) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          Para pedir a avaliação, guarda primeiro o link da tua ficha no Google (no Perfil da Empresa: “Pedir avaliações” → copiar o link).
        </p>
        {canEdit ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Link para avaliação no Google" error={error ?? undefined} className="min-w-0 flex-1">
              <Input inputMode="url" placeholder="https://g.page/r/…/review" value={link} onChange={(e) => setLink(e.target.value)} />
            </Field>
            <Button size="sm" className="h-10" onClick={saveLink} loading={saving} disabled={!link.trim()}>
              Guardar
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">Pede ao dono da conta para o guardar em Definições → Funcionalidades.</p>
        )}
      </div>
    );
  }

  const waText = waTemplate ? renderTemplate(waTemplate.body, context).text : null;
  const wa = waText ? whatsappUrl(lead.phone, waText) : null;
  return (
    <div className="flex flex-wrap gap-2">
      {wa && waTemplate ? (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          onClick={() => log.mutate({ type: 'template_used', payload: { template: waTemplate.name, template_id: waTemplate.id, via: 'whatsapp' } })}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1 text-sm hover:bg-surface-2 pointer-coarse:min-h-10"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Pedir por WhatsApp
        </a>
      ) : null}
      {emailTemplate && lead.email ? (
        <SendEmailButton
          lead={lead}
          subject={renderTemplate(emailTemplate.subject, context).text}
          body={renderTemplate(emailTemplate.body, context).text}
          template={emailTemplate.name}
          label="Pedir por email"
          variant="outline"
        />
      ) : null}
      {!wa && !(emailTemplate && lead.email) ? (
        <p className="text-sm text-muted">Este cliente não tem telemóvel nem email. Copia o link e envia-o como preferires: {settings.google_review_url}</p>
      ) : null}
    </div>
  );
}

export function WrapUpDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const set = useSetProjectCompleted();
  const [portfolio, setPortfolio] = useState(true);
  const [upsell, setUpsell] = useState(true);
  const [months, setMonths] = useState('6');
  const [done, setDone] = useState(false);

  async function complete() {
    try {
      await set.mutateAsync({ leadId: lead.id, completed: true, portfolio_task: portfolio, upsell_months: upsell ? Number(months) : null });
      setDone(true);
      toast.success('Projeto concluído. 🎉');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={done ? 'Projeto concluído 🎉' : 'Concluir o projeto'}
      description={lead.company_name}
      footer={
        done ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={complete} loading={set.isPending}>
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Concluir projeto
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {portfolio || upsell ? 'As tarefas ficaram criadas no cliente e aparecem em “Hoje” no dia. ' : ''}
            Agora é a altura certa para pedir uma avaliação:
          </p>
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Star className="h-4 w-4 text-accent-text" aria-hidden /> Pedir avaliação no Google
          </h3>
          <ReviewRequest lead={lead} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Antes de fechar, deixa estes passos tratados:</p>
          <label className="inline-flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={portfolio} onChange={(e) => setPortfolio(e.target.checked)} />
            <span>
              Criar a tarefa <strong>“Juntar o projeto ao portefólio”</strong> (daqui a uma semana)
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="inline-flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={upsell} onChange={(e) => setUpsell(e.target.checked)} />
              <span>Lembrar-me de propor um novo serviço (manutenção, redes sociais…) daqui a</span>
            </label>
            <Select value={months} onChange={(e) => setMonths(e.target.value)} disabled={!upsell} className="h-8 w-auto py-0" aria-label="Daqui a quantos meses">
              {UPSELL_MONTHS.map((m) => (
                <option key={m} value={String(m)}>
                  {m} meses
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted">No passo seguinte podes pedir uma avaliação no Google ao cliente.</p>
        </div>
      )}
    </Dialog>
  );
}

/**
 * `onWrapUp`: quem mostra os passos finais (a página Projetos, porque a linha
 * do projeto sai da lista "Em curso" mal fica concluído).
 */
export function ProjectToggle({
  lead,
  size = 'sm',
  onWrapUp,
  className,
}: {
  lead: Lead;
  size?: 'sm' | 'md';
  onWrapUp?: (lead: Lead) => void;
  className?: string;
}) {
  const set = useSetProjectCompleted();
  const [wrapUp, setWrapUp] = useState(false);
  const completed = !!lead.project_completed_at;

  async function reopen() {
    try {
      await set.mutateAsync({ leadId: lead.id, completed: false });
      toast.success('Projeto reaberto: volta aos projetos em curso.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <Button size={size} variant={completed ? 'ghost' : 'outline'} className={className} onClick={completed ? reopen : () => (onWrapUp ? onWrapUp(lead) : setWrapUp(true))} loading={set.isPending && completed}>
        {completed ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
        {completed ? 'Reabrir projeto' : 'Concluir projeto'}
      </Button>
      {wrapUp ? <WrapUpDialog lead={lead} onClose={() => setWrapUp(false)} /> : null}
    </>
  );
}
