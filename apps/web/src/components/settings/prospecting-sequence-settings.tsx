'use client';

/**
 * Definições → Follow-up e lembretes → Sequência multicanal: os passos da
 * Prospeção (dia, canal e modelo). Cada "Contactado" na sessão de prospeção faz
 * o passo atual e agenda o seguinte.
 */
import {
  DEFAULT_PROSPECTING_SEQUENCE,
  SEQUENCE_CHANNELS,
  SEQUENCE_CHANNEL_KINDS,
  SEQUENCE_CHANNEL_LABELS,
  SEQUENCE_MAX_STEPS,
  type ProspectingSequenceStep,
  type SequenceChannel,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Route, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useRole, useSettings, useTemplates } from '@/lib/queries';

export function ProspectingSequenceSettings() {
  const { data: settings } = useSettings();
  if (!settings) return <Skeleton className="h-40" />;
  return <Editor key={JSON.stringify(settings.prospecting_sequence)} initial={settings.prospecting_sequence} />;
}

function Editor({ initial }: { initial: { enabled: boolean; steps: ProspectingSequenceStep[] } }) {
  const qc = useQueryClient();
  const role = useRole();
  const { data: templates } = useTemplates();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [steps, setSteps] = useState(initial.steps.map((s) => ({ ...s, day: String(s.day) })));
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'owner' || role === 'admin';
  const update = (i: number, patch: Partial<(typeof steps)[number]>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    setSaving(true);
    try {
      await api('/settings', {
        method: 'PATCH',
        body: { prospecting_sequence: { enabled, steps: steps.map((s) => ({ day: Math.max(0, Math.round(Number(s.day) || 0)), channel: s.channel, template_id: s.template_id || null })) } },
      });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success(enabled ? 'Sequência multicanal guardada e ligada.' : 'Sequência multicanal guardada (desligada).');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card role="region" aria-label="Sequência multicanal">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Route className="h-4 w-4 text-accent-text" aria-hidden /> Sequência multicanal na Prospeção
          </span>
        }
        description="Um plano por lead, por exemplo: dia 0 WhatsApp, dia 3 email, dia 7 ligar. A Prospeção mostra o passo de cada lead com a mensagem já escrita; “Contactado” agenda o passo seguinte."
      />
      <div className="flex flex-col gap-4 p-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} />
          Usar a sequência multicanal (em vez do follow-up simples por email na Prospeção)
        </label>
        <ol className="flex flex-col gap-2" aria-label="Passos da sequência">
          {steps.map((s, i) => {
            const usable = (templates ?? []).filter((t) => SEQUENCE_CHANNEL_KINDS[s.channel].includes(t.kind));
            return (
              <li key={i} className="grid grid-cols-[auto_5.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_5.5rem_10rem_minmax(0,1fr)_auto]">
                <span className="w-14 text-sm text-muted">Passo {i + 1}</span>
                <label className="flex items-center gap-1 text-sm">
                  <span className="text-muted">dia</span>
                  <Input inputMode="numeric" value={s.day} onChange={(e) => update(i, { day: e.target.value })} aria-label={`Dia do passo ${i + 1}`} className="h-9 w-14" disabled={!canEdit} />
                </label>
                <Select value={s.channel} onChange={(e) => update(i, { channel: e.target.value as SequenceChannel, template_id: null })} aria-label={`Canal do passo ${i + 1}`} className="h-9" disabled={!canEdit}>
                  {SEQUENCE_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {SEQUENCE_CHANNEL_LABELS[c]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={s.template_id ?? ''}
                  onChange={(e) => update(i, { template_id: e.target.value || null })}
                  aria-label={`Modelo do passo ${i + 1}`}
                  className="col-span-2 h-9 sm:col-span-1"
                  disabled={!canEdit}
                >
                  <option value="">O 1.º modelo deste canal</option>
                  {usable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                {steps.length > 1 && canEdit ? (
                  <Button size="sm" variant="ghost" aria-label={`Tirar o passo ${i + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {steps.length < SEQUENCE_MAX_STEPS ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSteps([...steps, { day: String(Number(steps.at(-1)?.day ?? 0) + 7), channel: 'email', template_id: null }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Passo
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSteps(DEFAULT_PROSPECTING_SEQUENCE.steps.map((x) => ({ ...x, day: String(x.day) })))}>
              Repor sugestão
            </Button>
            <Button size="sm" onClick={() => void save()} loading={saving}>
              Guardar sequência
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted">
          Os dias contam a partir do 1.º contacto. Quando o lead responde (“Interessado”) ou diz que não (“Sem interesse”), sai da sequência.
        </p>
      </div>
    </Card>
  );
}
