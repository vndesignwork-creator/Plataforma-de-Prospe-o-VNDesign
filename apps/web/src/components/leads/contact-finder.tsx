'use client';

/**
 * Procurar contacto: para leads sem telefone ou email. Atalhos de pesquisa já
 * com o nome e a cidade, procura automática (site, página de contactos e
 * Google Maps) e guardar o que encontrares sem sair da página.
 */
import { contactSearchLinks, formatSharedPhone, type ContactFindings, type Lead } from '@vndesign/core';
import { ExternalLink, Mail, Phone, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useUpdateLead } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function ContactFinder({ lead, onSaved, className }: { lead: Lead; onSaved?: (lead: Lead) => void; className?: string }) {
  const update = useUpdateLead(lead.id);
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<ContactFindings | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const links = contactSearchLinks(lead);

  async function search() {
    setSearching(true);
    try {
      const { data } = await api<{ data: ContactFindings }>(`/leads/${lead.id}/find-contacts`, { method: 'POST' });
      setFound(data);
      const n = data.phones.length + data.emails.length;
      if (!n) toast.info(data.sources.length ? 'Não encontrei contactos novos. Experimenta os atalhos de pesquisa.' : 'Sem site para ler. Experimenta os atalhos de pesquisa.');
      // Preenche logo o que faltar com o primeiro resultado.
      if (!phone && data.phones[0]) setPhone(formatSharedPhone(data.phones[0]));
      if (!email && data.emails[0]) setEmail(data.emails[0]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const patch: { phone?: string | null; email?: string | null; website?: string } = {};
    if (phone.trim() !== (lead.phone ?? '')) patch.phone = phone.trim() || null;
    if (email.trim() !== (lead.email ?? '')) patch.email = email.trim() || null;
    if (found?.website && !lead.website) patch.website = found.website;
    if (!Object.keys(patch).length) return;
    try {
      const saved = await update.mutateAsync(patch);
      toast.success('Contactos guardados.');
      onSaved?.(saved);
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  // Email devolvido conta como sem email (procura-se outro).
  const missing = [!lead.phone && 'telefone', !lead.email ? 'email' : lead.email_bounced_at ? 'email válido' : false].filter(Boolean).join(' nem ');

  return (
    <section aria-label="Procurar contacto" className={cn('flex flex-col gap-3 rounded-lg border border-dashed border-border p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Search className="h-4 w-4 text-muted" aria-hidden /> Sem {missing}: procurar contacto
        </p>
        <Button size="sm" onClick={() => void search()} loading={searching}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Procurar automaticamente
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Pesquisar">
        {links.map((l) => (
          <a key={l.key} href={l.url} target="_blank" rel="noreferrer noopener" className={buttonClasses('outline', 'sm')}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {l.label}
            <span className="sr-only">(abre num novo separador)</span>
          </a>
        ))}
      </div>

      {found && found.phones.length + found.emails.length ? (
        <div className="flex flex-col gap-1.5 text-sm" role="status">
          <p className="text-xs text-muted">Encontrado em: {found.sources.join(', ')}. Toca para usar.</p>
          <ul className="flex flex-wrap gap-2" aria-label="Contactos encontrados">
            {found.phones.map((p) => (
              <li key={p}>
                <button type="button" onClick={() => setPhone(formatSharedPhone(p))} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 hover:bg-surface-3">
                  <Phone className="h-3.5 w-3.5 text-muted" aria-hidden /> {formatSharedPhone(p)}
                </button>
              </li>
            ))}
            {found.emails.map((m) => (
              <li key={m}>
                <button type="button" onClick={() => setEmail(m)} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 hover:bg-surface-3">
                  <Mail className="h-3.5 w-3.5 text-muted" aria-hidden /> {m}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={save} className="flex flex-wrap items-end gap-2" noValidate>
        <Field label="Telefone" error={errors.phone?.[0]} className="min-w-0 flex-[1_1_10rem]">
          <Input type="tel" inputMode="tel" autoComplete="off" placeholder="912 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email?.[0]} className="min-w-0 flex-[1_1_12rem]">
          <Input type="email" autoComplete="off" placeholder="geral@empresa.pt" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" loading={update.isPending} className="ml-auto">
          Guardar contactos
        </Button>
      </form>
    </section>
  );
}
