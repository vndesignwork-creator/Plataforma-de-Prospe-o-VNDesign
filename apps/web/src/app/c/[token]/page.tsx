import { formatDate, formatDateTime } from '@vndesign/core';
import { CheckCircle2, FileDown } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buttonClasses } from '@/components/ui/button';
import { getPublicContract } from '@/server/services/contracts';
import { AcceptForm } from './accept-form';

/*
 * Contrato para o cliente (link /c/<código>, sem login): ler, descarregar o
 * PDF e aceitar online. Depois de aceite, mostra quem aceitou e quando.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const contract = await getPublicContract((await params).token);
  return { title: { absolute: contract?.title ?? 'Contrato' }, robots: { index: false, follow: false } };
}

export default async function ContractPage({ params }: Props) {
  const token = (await params).token;
  const contract = await getPublicContract(token);
  if (!contract) notFound();
  const { provider, client, sections } = contract.content;
  const brand = provider.company || provider.name;
  const party = (label: string, p: typeof provider) => (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-semibold">{p.name}</p>
      {[p.company && p.company !== p.name ? p.company : null, p.nif ? `NIF ${p.nif}` : null, p.address, p.email, p.phone]
        .filter(Boolean)
        .map((l) => (
          <p key={l} className="text-muted">
            {l}
          </p>
        ))}
    </div>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold tracking-tight">
          {brand.startsWith('VN') ? (
            <>
              <span className="text-accent">VN</span>
              {brand.slice(2)}
            </>
          ) : (
            brand
          )}
        </p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{contract.title}</h1>
        <p className="text-sm text-muted">
          Contrato n.º {String(contract.number).padStart(3, '0')} · {formatDate(contract.created_at)}
        </p>
        <a href={`/api/v1/public/contracts/${token}/pdf`} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'sm', 'mt-2 self-start')}>
          <FileDown className="h-4 w-4" aria-hidden /> Descarregar PDF
        </a>
      </header>

      {contract.status === 'aceite' ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 font-medium text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> Contrato aceite por {contract.accepted_name} a {formatDateTime(contract.accepted_at!)}. Obrigado!
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {party('Prestador', provider)}
        {party('Cliente', client)}
      </div>

      <ol className="flex flex-col gap-4">
        {sections.map((s, i) => (
          <li key={i} className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 font-semibold">
              <span className="text-accent-text">{i + 1}.</span> {s.title}
            </h2>
            <div className="flex flex-col gap-1 text-sm whitespace-pre-line">{s.body}</div>
          </li>
        ))}
      </ol>

      {contract.status !== 'aceite' ? <AcceptForm token={token} defaultName={client.name} /> : null}
    </main>
  );
}
