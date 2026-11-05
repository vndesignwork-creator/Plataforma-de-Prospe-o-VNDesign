import { Download, Globe, Images, Mail, MessageCircle, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicCard } from '@/server/services/business-card';
import { telUrl, whatsappUrl } from '@/lib/utils';
import { CardContactForm } from './card-contact-form';

/*
 * Cartão de contacto (link /cartao/<código> ou o QR, sem login): quem sou,
 * os contactos, "Guardar contacto" (vCard) e um formulário para deixar o seu.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = await getPublicCard((await params).token);
  const title = card ? `${card.full_name}${card.company ? ` · ${card.company}` : ''}` : 'Cartão de contacto';
  return { title: { absolute: title }, description: card?.bio ?? card?.role_title ?? undefined, robots: { index: false, follow: false } };
}

const host = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export default async function CardPage({ params }: Props) {
  const token = (await params).token;
  const card = await getPublicCard(token, { countView: true });
  if (!card) notFound();
  const base = `/api/v1/public/cards/${token}`;
  const wa = card.phone ? whatsappUrl(card.phone) : null;
  const tel = card.phone ? telUrl(card.phone) : null;
  const links = [
    tel ? { href: tel, icon: Phone, label: 'Ligar', detail: card.phone } : null,
    wa ? { href: wa, icon: MessageCircle, label: 'WhatsApp', detail: card.phone } : null,
    card.email ? { href: `mailto:${card.email}`, icon: Mail, label: 'Email', detail: card.email } : null,
    card.website ? { href: card.website, icon: Globe, label: 'Site', detail: host(card.website) } : null,
    card.portfolio_url && (!card.website || host(card.portfolio_url) !== host(card.website)) ? { href: card.portfolio_url, icon: Images, label: 'Portefólio', detail: host(card.portfolio_url) } : null,
  ].filter((l): l is NonNullable<typeof l> => l !== null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-8 sm:py-12">
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-7 text-center">
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento
          <img src={`${base}/photo`} alt={`Fotografia de ${card.full_name}`} className="h-24 w-24 rounded-full border border-border object-cover" />
        ) : (
          <span aria-hidden className="flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft font-display text-3xl font-bold text-accent-text">
            {initials(card.full_name)}
          </span>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold">{card.full_name}</h1>
          {card.role_title || card.company ? (
            <p className="text-muted">{[card.role_title, card.company].filter(Boolean).join(' · ')}</p>
          ) : null}
        </div>
        {card.bio ? <p className="text-sm whitespace-pre-line">{card.bio}</p> : null}
        {card.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento
          <img src={`${base}/logo`} alt={card.company ? `Logótipo ${card.company}` : 'Logótipo'} className="max-h-12 w-auto max-w-[60%] object-contain" />
        ) : null}
        <a
          href={`${base}/vcard`}
          className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 font-semibold text-accent-fg hover:opacity-90"
        >
          <Download className="h-4 w-4" aria-hidden /> Guardar contacto
        </a>
      </section>

      {links.length ? (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {links.map(({ href, icon: Icon, label, detail }) => (
            <li key={label}>
              <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{label}</span>
                  {detail ? <span className="block truncate text-sm text-muted">{detail}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <CardContactForm token={token} firstName={card.full_name.split(/\s+/)[0] ?? card.full_name} />
    </main>
  );
}
