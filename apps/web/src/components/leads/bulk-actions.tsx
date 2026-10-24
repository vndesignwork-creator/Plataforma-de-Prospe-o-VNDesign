'use client';

/**
 * Mais ações em massa na lista de leads (além de Arquivar, Repor, Atribuir e
 * Apagar): pôr ou tirar uma etiqueta, mudar o estado e marcar o próximo
 * follow-up. As etiquetas e o follow-up têm "Anular" no aviso (só repõe o que
 * mudou: quem já tinha a etiqueta, ou a data que cada um tinha).
 */
import { LEAD_STATUSES, LEAD_STATUS_META, formatDate, normalizeTags, reschedulePlan, todayIso, type Lead, type LeadStatus } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, CircleDot, Plus, Tag, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusIcon } from '@/components/icons/lead-icons';
import { Button, buttonClasses } from '@/components/ui/button';
import { DateMenu } from '@/components/ui/date-menu';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { bulkResultMessage, useBulkLeadAction, useReschedule } from '@/lib/queries';
import { useLeadTags } from './tags';

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hasTag = (lead: Lead, tag: string) => (lead.tags ?? []).some((t) => fold(t) === fold(tag));

/** Pôr (ou tirar) uma etiqueta nos leads selecionados. */
export function BulkTagMenu({ rows, onDone }: { rows: Lead[]; onDone: () => void }) {
  const bulk = useBulkLeadAction();
  const qc = useQueryClient();
  const { data: all } = useLeadTags();
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState('');
  // Tirar: as etiquetas que os selecionados têm (as mais comuns primeiro).
  const present = new Map<string, number>();
  for (const l of rows) for (const t of l.tags ?? []) present.set(t, (present.get(t) ?? 0) + 1);
  const removable = [...present.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  async function run(action: 'tag_add' | 'tag_remove', raw: string) {
    const tag = normalizeTags([raw])[0];
    if (!tag) return;
    // O "Anular" só mexe nos que mudaram.
    const changed = rows.filter((l) => (action === 'tag_add' ? !hasTag(l, tag) && (l.tags ?? []).length < 10 : hasTag(l, tag))).map((l) => l.id);
    const refresh = () => void qc.invalidateQueries({ queryKey: ['lead-tags'] });
    try {
      const result = await bulk.mutateAsync({ action, ids: rows.map((l) => l.id), tag });
      refresh();
      onDone();
      const full = action === 'tag_add' ? rows.filter((l) => !hasTag(l, tag) && (l.tags ?? []).length >= 10).length : 0;
      toast.success(`${bulkResultMessage(result).replace(/\.$/, '')} “${tag}”.${full ? ` ${full} já tinha${full === 1 ? '' : 'm'} 10 etiquetas.` : ''}`, {
        action: changed.length
          ? {
              label: 'Anular',
              // mutateAsync: a barra (e este menu) já desapareceu, mas o aviso tem de aparecer na mesma.
              onClick: () =>
                bulk.mutateAsync({ action: action === 'tag_add' ? 'tag_remove' : 'tag_add', ids: changed, tag }).then(
                  (r) => (refresh(), toast.success(bulkResultMessage(r))),
                  (e: unknown) => toast.error(errorMessage(e)),
                ),
            }
          : undefined,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <DropdownRoot>
        <DropdownTrigger className={buttonClasses('outline', 'sm')}>
          <Tag className="h-3.5 w-3.5" aria-hidden /> Etiqueta…
        </DropdownTrigger>
        <DropdownContent className="max-h-80 overflow-y-auto">
          <DropdownLabel>Pôr a etiqueta</DropdownLabel>
          {(all ?? []).slice(0, 8).map((t) => (
            <DropdownItem key={t.tag} onSelect={() => void run('tag_add', t.tag)}>
              <Tag className="h-3.5 w-3.5 text-muted" aria-hidden /> {t.tag}
            </DropdownItem>
          ))}
          <DropdownItem
            onSelect={() => {
              setText('');
              setCreating(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 text-muted" aria-hidden /> Nova etiqueta…
          </DropdownItem>
          {removable.length ? (
            <>
              <DropdownSeparator />
              <DropdownLabel>Tirar dos selecionados</DropdownLabel>
              {removable.map((t) => (
                <DropdownItem key={t} onSelect={() => void run('tag_remove', t)}>
                  <X className="h-3.5 w-3.5 text-muted" aria-hidden /> Tirar “{t}”
                </DropdownItem>
              ))}
            </>
          ) : null}
        </DropdownContent>
      </DropdownRoot>
      {creating ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setCreating(false) : undefined)}
          title={`Etiqueta para ${rows.length === 1 ? '1 lead' : `${rows.length} leads`}`}
          className="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                form="bulk-new-tag"
                disabled={!normalizeTags([text]).length}
                loading={bulk.isPending}
              >
                Pôr a etiqueta
              </Button>
            </>
          }
        >
          <form
            id="bulk-new-tag"
            onSubmit={(e) => {
              e.preventDefault();
              setCreating(false);
              void run('tag_add', text);
            }}
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={30} placeholder="Ex.: feira de março" aria-label="Nova etiqueta" />
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

/** Mudar o estado dos selecionados (as regras de cada estado aplicam-se, como na ficha). */
export function BulkStatusMenu({ rows, onDone }: { rows: Lead[]; onDone: () => void }) {
  const bulk = useBulkLeadAction();
  async function run(status: LeadStatus) {
    try {
      const result = await bulk.mutateAsync({ action: 'status', ids: rows.map((l) => l.id), status });
      onDone();
      toast.success(`${bulkResultMessage(result).replace(/\.$/, '')} para “${LEAD_STATUS_META[status].label}”.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <DropdownRoot>
      <DropdownTrigger className={buttonClasses('outline', 'sm')}>
        <CircleDot className="h-3.5 w-3.5" aria-hidden /> Estado…
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Passar para</DropdownLabel>
        {LEAD_STATUSES.map((s) => (
          <DropdownItem key={s} onSelect={() => void run(s)}>
            <StatusIcon status={s} className="h-3.5 w-3.5" /> {LEAD_STATUS_META[s].label}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownRoot>
  );
}

/** Próximo follow-up dos selecionados (com "Anular": cada um volta à data que tinha). */
export function BulkFollowUpMenu({ rows, onDone }: { rows: Lead[]; onDone: () => void }) {
  const reschedule = useReschedule();
  const [today] = useState(() => todayIso());
  async function pick(date: string | null) {
    const plan = reschedulePlan(rows, [], date);
    try {
      const result = await reschedule.mutateAsync(plan.apply);
      onDone();
      const leads = result.leads === 1 ? '1 lead' : `${result.leads} leads`;
      toast.success(date ? `${leads} com follow-up a ${formatDate(date)}.` : `${leads} sem follow-up.`, {
        action: {
          label: 'Anular',
          onClick: () =>
            reschedule.mutateAsync(plan.undo).then(
              () => toast.success('Datas repostas.'),
              (e: unknown) => toast.error(errorMessage(e)),
            ),
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <DateMenu
      today={today}
      heading="Próximo follow-up"
      clearLabel="Sem follow-up"
      triggerClassName={buttonClasses('outline', 'sm')}
      label={
        <>
          <BellRing className="h-3.5 w-3.5" aria-hidden /> Follow-up…
        </>
      }
      onPick={(d) => void pick(d)}
    />
  );
}
