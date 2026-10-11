'use client';

import { leadPath } from '@vndesign/core';
import { PageHeader } from '@/components/layout/page-header';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { EmptyState, Skeleton } from '@/components/ui/card';
import { useLead } from '@/lib/queries';
import { LeadForm } from './lead-form';

export function EditLead({ id }: { id: string }) {
  const { data: lead, isLoading } = useLead(id);
  if (isLoading) return <Skeleton className="mx-auto h-96 max-w-5xl" />;
  if (!lead) return <EmptyState title="Lead não encontrado" />;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <Breadcrumbs
            items={[
              { label: 'Leads', href: '/leads' },
              { label: `#${lead.number} ${lead.company_name}`, href: leadPath(lead) },
            ]}
          />
        }
        title="Editar lead"
      />
      <LeadForm key={lead.updated_at} lead={lead} />
    </div>
  );
}
