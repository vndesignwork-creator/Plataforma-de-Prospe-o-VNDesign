import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { MapView } from '@/components/map/map-view';
import { Skeleton } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Mapa' };

export default function MapPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        title="Mapa"
        description="Os teus leads no mapa, pela cor do estado. Ótimo para planear visitas e ver onde há mais oportunidades."
      />
      <Suspense fallback={<Skeleton className="h-[65vh]" />}>
        <MapView />
      </Suspense>
    </div>
  );
}
