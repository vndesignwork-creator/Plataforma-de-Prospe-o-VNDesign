'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { SECTOR_ICONS, SECTOR_ICON_KEYS, SectorCreateSchema, sectorIconFor, type Sector } from '@vndesign/core';
import { Archive, ArchiveRestore, Edit3, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useSectors } from '@/lib/queries';
import { SECTOR_ICON_COMPONENTS, SectorIconView } from '@/components/icons/lead-icons';
import { cn } from '@/lib/utils';

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
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
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

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (sector) await api(`/sectors/${sector.id}`, { method: 'PATCH', body: values });
      else await api('/sectors', { method: 'POST', body: values });
      void qc.invalidateQueries({ queryKey: ['sectors'] });
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
          <div role="radiogroup" aria-label="Ícone do setor" className="flex flex-wrap gap-1.5">
            {SECTOR_ICON_KEYS.map((key) => {
              const Icon = SECTOR_ICON_COMPONENTS[key];
              const selected = watch('icon') === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
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
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function SectorsSettings() {
  const qc = useQueryClient();
  const { data: sectors, isLoading } = useSectors(true);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [open, setOpen] = useState(false);

  async function act(sector: Sector, action: 'archive' | 'restore' | 'delete') {
    try {
      if (action === 'delete') await api(`/sectors/${sector.id}`, { method: 'DELETE' });
      else await api(`/sectors/${sector.id}`, { method: 'PATCH', body: { archived: action === 'archive' } });
      void qc.invalidateQueries({ queryKey: ['sectors'] });
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
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Novo setor
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
            <li key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
                <SectorIconView sector={s} />
              </span>
              <div className="min-w-0 flex-1">
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
              <div className="flex gap-1">
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
