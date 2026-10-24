'use client';

/**
 * Ficheiros de um lead que ainda não é cliente: fotos do espaço, o menu em PDF,
 * a montra… São os ficheiros do kit da marca: quando passar a cliente, já lá estão.
 */
import type { Lead } from '@vndesign/core';
import { FilesSection } from '@/components/projects/brand-kit-card';
import { Card, CardHeader } from '@/components/ui/card';
import { useBrandKit } from '@/lib/queries';

export function LeadFilesCard({ lead }: { lead: Lead }) {
  const { data: kit } = useBrandKit(lead.id);
  const count = kit?.files.length ?? 0;
  return (
    <Card>
      <CardHeader title={`Ficheiros${count ? ` (${count})` : ''}`} description="Quando passar a cliente, ficam no kit da marca." />
      <FilesSection
        lead={lead}
        kit={kit}
        heading="Fotos e documentos"
        hint="Fotos do espaço ou da montra, o menu em PDF, o cartão de visita… (até 30 ficheiros de 25 MB)."
        label="Ficheiros do lead"
        listLabel="Lista de ficheiros do lead"
      />
    </Card>
  );
}
