'use client';

import { GEOCODE_STATUS_LABELS, type Lead } from '@vndesign/core';
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateLead } from '@/lib/queries';

/** Linha "Mapa" da ficha: estado da localização + localizar / ver no mapa. */
export function LeadLocation({ lead }: { lead: Lead }) {
  const invalidate = useInvalidateLead();
  const [busy, setBusy] = useState(false);
  const located = lead.latitude !== null && lead.longitude !== null;
  const canLocate = !!(lead.address || lead.city) && !lead.anonymized_at;

  async function locate() {
    setBusy(true);
    try {
      const { data } = await api<{ data: Lead }>(`/leads/${lead.id}/location`, { method: 'POST' });
      invalidate(lead.id);
      if (data.geocode_status === 'not_found') toast.error('Morada não encontrada. Podes marcar a posição no mapa.');
      else toast.success(data.geocode_status === 'approx' ? 'Localizado pela cidade (aproximado).' : 'Localizado no mapa.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={located ? '' : 'text-muted'}>
        {lead.geocode_status ? GEOCODE_STATUS_LABELS[lead.geocode_status] : 'Ainda não localizado'}
      </span>
      {located ? (
        <Link href={`/mapa?lead=${lead.id}`} className="inline-flex items-center gap-1 text-accent-text hover:underline">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> Ver no mapa
        </Link>
      ) : null}
      {!lead.anonymized_at && (lead.geocode_status === 'not_found' || lead.geocode_status === 'approx' || (!located && !canLocate)) ? (
        <Link href={`/mapa?lead=${lead.id}&marcar=1`} className="text-accent-text hover:underline">
          Marcar no mapa
        </Link>
      ) : null}
      {canLocate && lead.geocode_status !== 'ok' && lead.geocode_status !== 'manual' ? (
        <Button size="sm" variant="outline" onClick={locate} loading={busy}>
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {lead.geocode_status ? 'Procurar outra vez' : 'Localizar'}
        </Button>
      ) : null}
    </span>
  );
}
