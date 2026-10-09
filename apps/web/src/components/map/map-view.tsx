'use client';

import { LEAD_STATUSES, LEAD_STATUS_META, type GeocodeBatchResult } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Crosshair, MapPinned } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MultiSelectFilter } from '@/components/leads/multi-select';
import { useTheme } from '@/components/layout/theme';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateLead, useLead, useMapData, useSectors } from '@/lib/queries';
import { SectorIconView, StatusIcon } from '@/components/icons/lead-icons';

// O Leaflet usa `window`: só no browser.
const LeafletMap = dynamic(() => import('./leaflet-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const STATUS_OPTIONS = LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label, icon: <StatusIcon status={s} /> }));

export function MapView() {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = params.get('lead');
  const placingParam = params.get('marcar') === '1';
  const { theme } = useTheme();
  const qc = useQueryClient();
  const invalidateLead = useInvalidateLead();
  const [status, setStatus] = useState<string[]>([]);
  const [sector, setSector] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [placing, setPlacing] = useState(placingParam);
  const { data: sectors } = useSectors();
  const { data, isLoading } = useMapData({
    status: status.length ? status.join(',') : undefined,
    sector: sector.length ? sector.join(',') : undefined,
  });
  const { data: focusLead } = useLead(focusId ?? '');

  const sectorOptions = useMemo(
    () => [
      ...(sectors ?? []).map((s) => ({ value: s.id, label: s.name, icon: <SectorIconView sector={s} className="text-muted" /> })),
      { value: 'none', label: 'Sem setor' },
    ],
    [sectors],
  );

  async function geocodeAll() {
    let total = { processed: 0, found: 0, approximate: 0, not_found: 0 };
    setProgress('A localizar…');
    try {
      for (let round = 0; round < 40; round++) {
        const { data: r } = await api<{ data: GeocodeBatchResult }>('/map/geocode', { method: 'POST' });
        total = {
          processed: total.processed + r.processed,
          found: total.found + r.found,
          approximate: total.approximate + r.approximate,
          not_found: total.not_found + r.not_found,
        };
        setProgress(`Localizados ${total.processed} · faltam ${r.remaining}`);
        void qc.invalidateQueries({ queryKey: ['map'] });
        if (r.remaining === 0 || r.processed === 0) break;
      }
      toast.success(
        `${total.found} localizados${total.approximate ? `, ${total.approximate} pela cidade` : ''}${
          total.not_found ? `, ${total.not_found} não encontrados` : ''
        }.`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setProgress(null);
    }
  }

  async function place(lat: number, lng: number) {
    if (!focusId) return;
    try {
      await api(`/leads/${focusId}/location`, { method: 'POST', body: { latitude: lat, longitude: lng } });
      setPlacing(false);
      invalidateLead(focusId);
      void qc.invalidateQueries({ queryKey: ['map'] });
      toast.success('Posição gravada.');
      router.replace(`/mapa?lead=${focusId}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const leads = data?.leads ?? [];
  const counts = data?.counts;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
        <MultiSelectFilter label="Estado" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <MultiSelectFilter label="Setor" options={sectorOptions} value={sector} onChange={setSector} />
        <span className="ml-auto text-sm text-muted" aria-live="polite">
          {counts
            ? `${leads.length} no mapa${counts.missing ? ` · ${counts.missing} por localizar` : ''}${
                counts.not_found ? ` · ${counts.not_found} sem morada encontrada` : ''
              }`
            : ''}
        </span>
        {counts && counts.missing > 0 ? (
          <Button size="sm" onClick={geocodeAll} loading={progress !== null}>
            <MapPinned className="h-3.5 w-3.5" aria-hidden /> Localizar {counts.missing} leads
          </Button>
        ) : null}
      </div>
      {progress ? (
        <p className="text-sm text-muted" aria-live="polite">
          {progress} (o OpenStreetMap permite 1 pesquisa por segundo)
        </p>
      ) : null}

      {focusId && focusLead ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span>
            <Link href={`/leads/${focusLead.id}`} className="font-medium hover:underline">
              #{focusLead.number} {focusLead.company_name}
            </Link>
            {placing ? ' — clica no mapa onde fica o negócio.' : ''}
          </span>
          <Button size="sm" variant={placing ? 'secondary' : 'outline'} onClick={() => setPlacing((p) => !p)}>
            <Crosshair className="h-3.5 w-3.5" aria-hidden /> {placing ? 'Cancelar' : 'Corrigir posição'}
          </Button>
        </div>
      ) : null}

      <Card className="h-[65vh] min-h-[22rem] overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <LeafletMap leads={leads} theme={theme} focusId={focusId} placing={placing} onPlace={place} />
        )}
      </Card>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legenda">
        {LEAD_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEAD_STATUS_META[s].color }} aria-hidden />
            {LEAD_STATUS_META[s].label}
          </span>
        ))}
        <span>· círculo tracejado = posição aproximada</span>
      </div>

      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Lista dos leads no mapa ({leads.length})</summary>
        <ul className="divide-y divide-border">
          {leads.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <Link href={`/leads/${l.id}`} className="min-w-0 truncate hover:underline">
                <span className="text-muted tabular">#{l.number}</span> {l.company_name}
              </Link>
              <span className="shrink-0 text-xs text-muted">
                {LEAD_STATUS_META[l.status].label}
                {l.city ? ` · ${l.city}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
