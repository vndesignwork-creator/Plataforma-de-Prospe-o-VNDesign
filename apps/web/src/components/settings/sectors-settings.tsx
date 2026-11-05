'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CALL_AVOID_PRESETS, SECTOR_ICONS, SECTOR_ICON_KEYS, SectorCreateSchema, callWindowLabel, sectorIconFor, type CallAvoidWindow, type Sector } from '@vndesign/core';
import { Archive, ArchiveRestore, BellOff, Edit3, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateSectors, useSectors, useSettings } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { SECTOR_ICON_COMPONENTS, SectorIconView } from '@/components/icons/lead-icons';
import { cn } from '@/lib/utils';
import { rovingKeyDown, rovingTabIndex } from '@/lib/roving';

type SectorInput = z.input<typeof SectorCreateSchema>;
type SectorOutput = z.output<typeof SectorCreateSchema>;

const toNumberOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

function SectorDialog({
  sector,
  open,
  onOpenChange,
}: {
  sector: Sector | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidateSectors = useInvalidateSectors();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  // Horas a evitar para ligar (ficam nas definições, por setor).
  const savedAvoid = (sector && settings?.call_avoid?.[sector.id]) || [];
  const [avoid, setAvoid] = useState<CallAvoidWindow[] | null>(null);
  const windows = avoid ?? savedAvoid;
  const [custom, setCustom] = useState({ from: '', to: '' });
  // Ao abrir (outro setor ou o mesmo outra vez), começa pelo que está guardado.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- repor o rascunho ao abrir */
    setAvoid(null);
  }, [open, sector?.id]);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SectorInput, unknown, SectorOutput>({
    resolver: zodResolver(SectorCreateSchema),
    values: {
      name: sector?.name ?? '',
      emoji: sector?.emoji ?? '',
      icon: sector ? sectorIconFor(sector) : 'briefcase',
      priority_rank: sector?.priority_rank ?? null,
      opportunity_notes: sector?.opportunity_notes ?? '',
      sales_arguments: sector?.sales_arguments ?? '',
    },
  });

  const currentIcon = useWatch({ control, name: 'icon' });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = sector
        ? (await api<{ data: Sector }>(`/sectors/${sector.id}`, { method: 'PATCH', body: values })).data
        : (await api<{ data: Sector }>('/sectors', { method: 'POST', body: values })).data;
      if (avoid !== null && settings && JSON.stringify(avoid) !== JSON.stringify(savedAvoid)) {
        const next = { ...settings.call_avoid };
        if (avoid.length) next[saved.id] = avoid;
        else delete next[saved.id];
        await api('/settings', { method: 'PATCH', body: { call_avoid: next } });
        void qc.invalidateQueries({ queryKey: ['settings'] });
      }
      invalidateSectors();
      toast.success(sector ? 'Setor atualizado.' : 'Setor criado.');
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={sector ? `Editar ${sector.name}` : 'Novo setor'}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={isSubmitting}>
            Gravar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nome" error={errors.name?.message} required className="sm:col-span-2">
          <Input {...register('name')} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Ícone</legend>
          <div role="radiogroup" aria-label="Ícone do setor" onKeyDown={rovingKeyDown} className="flex flex-wrap gap-1.5">
            {SECTOR_ICON_KEYS.map((key, i) => {
              const Icon = SECTOR_ICON_COMPONENTS[key];
              const selected = currentIcon === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={rovingTabIndex(selected, i, SECTOR_ICON_KEYS.some((k) => k === currentIcon))}
                  aria-label={SECTOR_ICONS[key]}
                  title={SECTOR_ICONS[key]}
                  onClick={() => setValue('icon', key, { shouldDirty: true })}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                    selected ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:border-border-strong hover:text-fg',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label="Prioridade (1 = maior oportunidade)" error={errors.priority_rank?.message} className="sm:col-span-2">
          <Input type="number" min={1} max={99} {...register('priority_rank', { setValueAs: toNumberOrNull })} />
        </Field>
        <Field label="Notas de oportunidade" error={errors.opportunity_notes?.message} className="sm:col-span-2">
          <Textarea rows={2} {...register('opportunity_notes')} />
        </Field>
        <Field label="Argumentos de venda" error={errors.sales_arguments?.message} className="sm:col-span-2" hint="Usados nos scripts de contacto (Fase C).">
          <Textarea rows={4} {...register('sales_arguments')} />
        </Field>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <BellOff className="h-4 w-4 text-muted" aria-hidden /> Horas a evitar para ligar
          </legend>
          <p className="-mt-1 text-xs text-muted">Na Prospeção (a ligar), os leads deste setor passam para o fim nestas horas, com o aviso “má altura”.</p>
          {windows.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Horas a evitar">
              {windows.map((w, i) => (
                <li key={`${w.from}-${w.to}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-sm">
                  {callWindowLabel(w)}
                  <button type="button" onClick={() => setAvoid(windows.filter((_, j) => j !== i))} aria-label={`Tirar ${callWindowLabel(w)}`} className="rounded-full p-0.5 text-muted hover:text-danger">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {windows.length < 4 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {CALL_AVOID_PRESETS.filter((p) => !windows.some((w) => w.from === p.window.from && w.to === p.window.to)).map((p) => (
                <button key={p.label} type="button" onClick={() => setAvoid([...windows, p.window])} className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs text-muted hover:text-fg">
                  + {p.label}
                </button>
              ))}
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                ou das
                <input type="time" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Evitar a partir de" className="h-7 rounded border border-border-input bg-surface-2 px-1" />
                às
                <input type="time" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Evitar até" className="h-7 rounded border border-border-input bg-surface-2 px-1" />
                <button
                  type="button"
                  disabled={!custom.from || !custom.to || custom.from === custom.to}
                  onClick={() => {
                    setAvoid([...windows, { from: custom.from, to: custom.to }]);
                    setCustom({ from: '', to: '' });
                  }}
                  className="rounded border border-border px-2 py-0.5 hover:bg-surface-2 disabled:opacity-50"
                >
                  Juntar
                </button>
              </span>
            </div>
          ) : null}
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function SectorsSettings() {
  const invalidateSectors = useInvalidateSectors();
  const { data: sectors, isLoading } = useSectors(true);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [open, setOpen] = useState(false);

  async function act(sector: Sector, action: 'archive' | 'restore' | 'delete') {
    try {
      if (action === 'delete') await api(`/sectors/${sector.id}`, { method: 'DELETE' });
      else await api(`/sectors/${sector.id}`, { method: 'PATCH', body: { archived: action === 'archive' } });
      invalidateSectors();
      toast.success(action === 'delete' ? 'Setor apagado.' : action === 'archive' ? 'Setor arquivado.' : 'Setor reativado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card id="setores">
      <CardHeader
        title="Setores"
        description="Setores e oportunidades (equivalente ao separador “Sectores Oportunidades”)."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo setor
          </Button>
        }
      />
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-40" />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {(sectors ?? []).map((s) => (
            <li key={s.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
                <SectorIconView sector={s} />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {s.name}
                  {s.priority_rank ? <Badge tone="accent">Prioridade {s.priority_rank}</Badge> : null}
                  {s.archived_at ? <Badge>Arquivado</Badge> : null}
                  <span className="text-sm font-normal text-muted tabular">
                    {s.lead_count} lead{s.lead_count === 1 ? '' : 's'}
                  </span>
                </p>
                {s.opportunity_notes ? <p className="mt-0.5 text-sm text-muted">{s.opportunity_notes}</p> : null}
              </div>
              <div className="col-start-2 -ml-2 flex gap-1 sm:col-start-auto sm:ml-0">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${s.name}`}
                  onClick={() => {
                    setEditing(s);
                    setOpen(true);
                  }}
                >
                  <Edit3 className="h-4 w-4" aria-hidden />
                </Button>
                {s.archived_at ? (
                  <Button size="icon" variant="ghost" aria-label={`Reativar ${s.name}`} onClick={() => act(s, 'restore')}>
                    <ArchiveRestore className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" aria-label={`Arquivar ${s.name}`} onClick={() => act(s, 'archive')}>
                    <Archive className="h-4 w-4" aria-hidden />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={s.lead_count ? `${s.name} tem leads: arquiva em vez de apagar` : `Apagar ${s.name}`}
                  title={s.lead_count ? 'Tem leads — arquiva em vez de apagar' : undefined}
                  disabled={(s.lead_count ?? 0) > 0}
                  onClick={() => act(s, 'delete')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <SectorDialog sector={editing} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
