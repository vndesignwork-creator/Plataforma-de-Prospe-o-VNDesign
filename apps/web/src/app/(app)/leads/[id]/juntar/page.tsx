import type { Metadata } from 'next';
import { resolveLeadRoute } from '@/server/lead-route';
import { PageHeader } from '@/components/layout/page-header';
import { MergeView } from '@/components/leads/merge-view';

export const metadata: Metadata = { title: 'Juntar duplicados' };

export default async function MergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ com?: string; rascunho?: string }>;
}) {
  const { id: ref } = await params;
  const search = await searchParams;
  const id = await resolveLeadRoute(ref, { suffix: '/juntar', search });
  const { com, rascunho } = search;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Juntar duplicados"
        description="Escolhe, campo a campo, que valor fica. Só aparecem os campos com valores diferentes."
      />
      <MergeView id={id} otherId={com} useDraft={rascunho === '1'} />
    </div>
  );
}
