import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { MapView } from '@/components/map/map-view';
import { Skeleton } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Mapa dos leads' };

export default function MapPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        eyebrow={
          <Link href="/leads" className="hover:text-fg hover:underline">
            Leads
          </Link>
        }
        title="Mapa dos leads"
        description="Os teus leads no mapa, pela cor do estado: onde há mais oportunidades e que zonas já trabalhaste."
      />
      <Suspense fallback={<Skeleton className="h-[65vh]" />}>
        <MapView />
      </Suspense>
    </div>
  );
}
