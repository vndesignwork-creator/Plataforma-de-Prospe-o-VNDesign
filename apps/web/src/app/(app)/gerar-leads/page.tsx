import type { Metadata } from 'next';
import { LeadGenerator } from '@/components/lead-generation/lead-generator';

export const metadata: Metadata = { title: 'Gerar leads' };

export default async function GenerateLeadsPage({ searchParams }: { searchParams: Promise<{ pesquisa?: string }> }) {
  const { pesquisa } = await searchParams;
  // Só um id válido (o link vem da notificação ou do email da pesquisa automática).
  const initialRunId = pesquisa && /^[0-9a-f-]{36}$/i.test(pesquisa) ? pesquisa : null;
  return (
    <div className="mx-auto max-w-4xl">
      <LeadGenerator initialRunId={initialRunId} />
    </div>
  );
}
