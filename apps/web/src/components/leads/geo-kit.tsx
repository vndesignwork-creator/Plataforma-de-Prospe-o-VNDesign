'use client';

/**
 * Kit GEO na ficha do lead: o que se entrega para o site aparecer nas IAs.
 * Perfil do Google (nota e avaliações vs. concorrentes), dados estruturados
 * schema.org, perguntas frequentes com IA e o llms.txt — tudo pronto a copiar
 * (WordPress/Bricks: elemento "Código").
 */
import {
  SCHEMA_BUSINESS_TYPES,
  buildBusinessJsonLd,
  buildFaqHtml,
  buildFaqJsonLd,
  buildLlmsTxt,
  formatDate,
  formatDateTime,
  googleComparison,
  googleMapsSearchUrl,
  googleProfileUnconfirmed,
  jsonLdScript,
  type GeoBusiness,
  type GeoFaqItem,
  type GoogleCheck,
  type GoogleProfile,
  type Lead,
  type LeadGeo,
  type SchemaBusinessType,
} from '@vndesign/core';
import { CheckCircle2, Code2, Copy, Download, FileText, Info, MapPin, MessageCircleQuestion, Plus, Sparkles, Star, Trash2, Wand2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CollapseButton, useProspectingCollapsed } from '@/components/ui/collapse';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useLeadGeo, useLeadGeoAction } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Tab = 'google' | 'schema' | 'faq' | 'llms';
const TABS: { id: Tab; label: string; icon: typeof Star }[] = [
  { id: 'google', label: 'Perfil do Google', icon: MapPin },
  { id: 'schema', label: 'Dados estruturados', icon: Code2 },
  { id: 'faq', label: 'Perguntas frequentes', icon: MessageCircleQuestion },
  { id: 'llms', label: 'llms.txt', icon: FileText },
];

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

function CodeBox({ code, label, children }: { code: string; label: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex gap-1">
          {children}
          <Button size="sm" variant="outline" onClick={() => void copy(code, label)}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
          </Button>
        </span>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed break-words whitespace-pre-wrap" aria-label={label}>
        {code}
      </pre>
    </div>
  );
}

export function GeoKitCard({ lead }: { lead: Lead }) {
  const { data: geo, isLoading } = useLeadGeo(lead.id, !lead.anonymized_at);
  const [tab, setTab] = useState<Tab>('google');
  const [collapsed, setCollapsed] = useProspectingCollapsed('kit-geo', lead.status);
  if (lead.anonymized_at) return null;
  return (
    <Card role="region" aria-label="Kit GEO">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-accent-text" aria-hidden /> Kit GEO
          </span>
        }
        description="O que entregas para o site aparecer nas IAs: perfil do Google, dados estruturados, perguntas frequentes e llms.txt."
        actions={<CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label="Kit GEO" />}
        className={collapsed ? 'border-b-0' : undefined}
      />
      {collapsed ? null : (
        <>
          <div role="tablist" aria-label="Kit GEO" className="flex gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none]">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  '-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-sm',
                  tab === id ? 'border-accent font-medium text-accent-text' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <div className="p-4" role="tabpanel">
            {isLoading || !geo ? (
              <Skeleton className="h-24" />
            ) : tab === 'google' ? (
              <GoogleTab leadId={lead.id} geo={geo} city={lead.city} />
            ) : tab === 'schema' ? (
              <SchemaTab key={JSON.stringify(geo.business)} leadId={lead.id} geo={geo} />
            ) : tab === 'faq' ? (
              <FaqTab key={geo.faq_generated_at ?? 'faq'} leadId={lead.id} geo={geo} />
            ) : (
              <LlmsTab geo={geo} />
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------

function Status({ p, check }: { p: GoogleProfile; check: GoogleCheck }) {
  // A pesquisa da IA não vê o Google Maps: não encontrar não prova que não exista.
  if (googleProfileUnconfirmed(check, p)) return <Badge tone="warning">Não confirmado</Badge>;
  if (!p.found) return <Badge tone="danger">Sem perfil no Google</Badge>;
  return (
    <span className="inline-flex items-center gap-1 text-sm whitespace-nowrap tabular">
      <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
      {p.rating !== null ? p.rating.toLocaleString('pt-PT', { maximumFractionDigits: 1 }) : '—'}
      <span className="text-muted">· {p.reviews ?? 0} avaliações</span>
    </span>
  );
}

/** Confirmar à mão (depois de ver no Google Maps): tem perfil, com a nota e as avaliações, ou não tem. */
function ConfirmDialog({
  leadId,
  index,
  profile,
  mapsUrl,
  onClose,
}: {
  leadId: string;
  index: number;
  profile: GoogleProfile;
  mapsUrl: string;
  onClose: () => void;
}) {
  const action = useLeadGeoAction(leadId);
  // Por omissão "Tem perfil": quem vem confirmar normalmente encontrou-o no Maps.
  const [found, setFound] = useState(profile.found || !profile.confirmed_at);
  const [rating, setRating] = useState(profile.rating !== null ? String(profile.rating).replace('.', ',') : '');
  const [reviews, setReviews] = useState(profile.reviews !== null ? String(profile.reviews) : '');
  const [link, setLink] = useState(profile.maps_url ?? '');
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);

  async function save() {
    const r = num(rating);
    const n = num(reviews);
    try {
      await action.mutateAsync({
        save: {
          google_confirm: found
            ? { index, found, rating: r, reviews: n === null ? null : Math.round(n), maps_url: link.trim() || null }
            : { index, found },
        },
      });
      toast.success(found ? `Perfil de ${profile.name} confirmado.` : `${profile.name}: sem perfil no Google.`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Perfil do Google · ${profile.name}`}
      description={
        <>
          Vê no{' '}
          <a href={mapsUrl} target="_blank" rel="noreferrer noopener" className="text-accent-text hover:underline">
            Google Maps
          </a>{' '}
          e confirma o que lá está. Fica guardado e vale mais do que a pesquisa da IA.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={action.isPending}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Tem perfil no Google?" className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={found === v}
              onClick={() => setFound(v)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium',
                found === v ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:text-fg',
              )}
            >
              {v ? 'Tem perfil' : 'Não tem perfil'}
            </button>
          ))}
        </div>
        {found ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nota (1 a 5)">
              <Input inputMode="decimal" placeholder="4,6" value={rating} onChange={(e) => setRating(e.target.value)} />
            </Field>
            <Field label="N.º de avaliações">
              <Input inputMode="numeric" placeholder="87" value={reviews} onChange={(e) => setReviews(e.target.value)} />
            </Field>
            <Field label="Link do Google Maps (opcional)" className="col-span-2">
              <Input type="url" placeholder="https://maps.app.goo.gl/…" value={link} onChange={(e) => setLink(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function GoogleTab({ leadId, geo, city }: { leadId: string; geo: LeadGeo; city: string | null }) {
  const action = useLeadGeoAction(leadId);
  const g = geo.google;
  const sentence = g ? googleComparison(g) : null;
  const [confirming, setConfirming] = useState<number | null>(null);
  const profiles = g ? [g.lead, ...g.competitors] : [];
  const unconfirmed = g ? profiles.some((p) => googleProfileUnconfirmed(g, p)) : false;
  const mapsUrl = (p: GoogleProfile) => p.maps_url ?? googleMapsSearchUrl(p.name, city);
  const open = confirming !== null ? profiles[confirming] : undefined;

  async function check() {
    try {
      await action.mutateAsync({ generate: 'google' });
      toast.success('Perfil do Google atualizado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!g ? (
        <p className="text-sm text-muted">
          Vê a nota e o número de avaliações no Google Maps — do lead e dos concorrentes que aparecem em “Aparece nas IAs?”. As IAs dão muito peso às
          avaliações.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label="Perfis do Google">
            {profiles.map((p, i) => (
              <li key={`${p.name}-${i}`} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', i === 0 && 'bg-surface-2')}>
                {/* Telemóvel: o nome numa linha e a nota e os ícones por baixo. */}
                <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                    <span className="min-w-0 break-words">{p.name}</span>
                    {i === 0 ? <Badge tone="accent">este lead</Badge> : null}
                  </span>
                  {p.confirmed_at ? (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <CheckCircle2 className="h-3 w-3 text-success" aria-hidden /> Confirmado por ti a {formatDate(p.confirmed_at.slice(0, 10))}
                    </span>
                  ) : null}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <Status p={p} check={g} />
                  <a
                    href={mapsUrl(p)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={buttonClasses('ghost', 'icon', 'h-8 w-8 text-muted hover:text-fg')}
                    title={p.maps_url ? 'Abrir no Google Maps' : 'Procurar no Google Maps'}
                    aria-label={`${p.maps_url ? 'Abrir' : 'Procurar'} ${p.name} no Google Maps`}
                  >
                    <MapPin className="h-4 w-4" aria-hidden />
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted hover:text-fg"
                    onClick={() => setConfirming(i)}
                    title="Confirmar o perfil (depois de ver no Maps)"
                    aria-label={`Confirmar o perfil de ${p.name}`}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {sentence ? (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <p className="flex-1">{sentence}</p>
              <Button size="sm" variant="ghost" onClick={() => void copy(sentence, 'Frase')} aria-label="Copiar a frase para o cliente" title="Copiar a frase">
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ) : null}
          {unconfirmed ? (
            <p className="text-xs text-muted">
              “Não confirmado” não quer dizer que não tenha perfil: abre no Maps <MapPin className="inline h-3 w-3 align-[-2px]" aria-hidden /> e confirma{' '}
              <CheckCircle2 className="inline h-3 w-3 align-[-2px]" aria-hidden />.
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {formatDateTime(g.checked_at)} · {g.source === 'places' ? 'dados do Google (Places API)' : 'pesquisa da IA (aproximada)'}
            {g.source === 'places' ? null : (
              <span title="Com a chave GOOGLE_PLACES_API_KEY no servidor, a nota e as avaliações vêm diretamente do Google." className="inline-flex cursor-help">
                <Info className="h-3 w-3" aria-label="Com a chave GOOGLE_PLACES_API_KEY no servidor, a nota e as avaliações vêm diretamente do Google." />
              </span>
            )}
            {!g.competitors.length ? ' · faz “Aparece nas IAs?” para comparar com os concorrentes' : ''}
          </p>
        </>
      )}
      <div>
        <Button size="sm" variant={g ? 'outline' : 'primary'} onClick={() => void check()} loading={action.isPending}>
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {g ? 'Atualizar' : 'Ver no Google'}
        </Button>
        {action.isPending ? <span className="ml-2 text-xs text-muted">A procurar… (até 1 minuto)</span> : null}
      </div>
      {confirming !== null && open ? (
        <ConfirmDialog leadId={leadId} index={confirming} profile={open} mapsUrl={mapsUrl(open)} onClose={() => setConfirming(null)} />
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------

const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

function SchemaTab({ leadId, geo }: { leadId: string; geo: LeadGeo }) {
  const action = useLeadGeoAction(leadId);
  const [b, setB] = useState<GeoBusiness>(geo.business);
  const [dirty, setDirty] = useState(!geo.business_saved);
  const set = (patch: Partial<GeoBusiness>) => {
    setB({ ...b, ...patch });
    setDirty(true);
  };
  const text = (k: keyof GeoBusiness) => ({
    value: (b[k] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value.trim() ? e.target.value : null } as Partial<GeoBusiness>),
  });

  async function save() {
    try {
      await action.mutateAsync({ save: { business: b } });
      setDirty(false);
      toast.success('Dados do negócio guardados.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {geo.business_saved ? 'Dados guardados.' : 'Sugestões a partir da ficha do lead: confirma e completa (horário, descrição).'} O código atualiza-se enquanto escreves.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de negócio">
          <Select value={b.type} onChange={(e) => set({ type: e.target.value as SchemaBusinessType })}>
            {SCHEMA_BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome">
          <Input value={b.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Descrição curta" className="sm:col-span-2">
          <Textarea rows={2} {...text('description')} placeholder="Ex.: Construção e remodelações em Lisboa e Cascais desde 2010." />
        </Field>
        <Field label="Site">
          <Input {...text('url')} placeholder="https://" />
        </Field>
        <Field label="Telefone">
          <Input {...text('phone')} />
        </Field>
        <Field label="Email">
          <Input {...text('email')} />
        </Field>
        <Field label="Morada">
          <Input {...text('street')} />
        </Field>
        <Field label="Código postal">
          <Input {...text('postal_code')} placeholder="0000-000" />
        </Field>
        <Field label="Localidade">
          <Input {...text('city')} />
        </Field>
        <Field label="Zona servida">
          <Input {...text('area_served')} placeholder="Ex.: Lisboa e arredores" />
        </Field>
        <Field label="Gama de preços">
          <Input {...text('price_range')} placeholder="Ex.: €€" />
        </Field>
        <Field label="Horário (uma linha por período)" hint="Ex.: Seg–Sex 09:00–18:00 · Sáb 09:00–13:00">
          <Textarea rows={3} value={b.opening_hours.join('\n')} onChange={(e) => set({ opening_hours: lines(e.target.value) })} />
        </Field>
        <Field label="Serviços (um por linha)">
          <Textarea rows={3} value={b.services.join('\n')} onChange={(e) => set({ services: lines(e.target.value) })} />
        </Field>
        <Field label="Redes sociais e perfis (um por linha)" className="sm:col-span-2" hint="Facebook, Instagram, Google Maps, LinkedIn…">
          <Textarea rows={2} value={b.same_as.join('\n')} onChange={(e) => set({ same_as: lines(e.target.value) })} />
        </Field>
      </div>
      <div>
        <Button size="sm" onClick={() => void save()} loading={action.isPending} disabled={!dirty || !b.name.trim()}>
          Guardar dados
        </Button>
      </div>
      <CodeBox code={jsonLdScript(buildBusinessJsonLd(b))} label="Código schema.org (JSON-LD)" />
      <p className="text-xs text-muted">
        Cola no cabeçalho do site (no Bricks: elemento “Código” na página inicial, ou num plugin de cabeçalho). Confirma em search.google.com/test/rich-results.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------

function FaqTab({ leadId, geo }: { leadId: string; geo: LeadGeo }) {
  const action = useLeadGeoAction(leadId);
  const [items, setItems] = useState<GeoFaqItem[]>(geo.faq);
  const [dirty, setDirty] = useState(false);
  const change = (next: GeoFaqItem[]) => {
    setItems(next);
    setDirty(true);
  };
  const valid = items.filter((i) => i.question.trim().length >= 5 && i.answer.trim().length >= 5);

  async function generate() {
    try {
      await action.mutateAsync({ generate: 'faq' });
      toast.success('Perguntas frequentes escritas pela IA. Revê antes de pôr no site.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  async function save() {
    try {
      await action.mutateAsync({ save: { faq: valid } });
      setDirty(false);
      toast.success('Perguntas frequentes guardadas.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!items.length ? (
        <p className="text-sm text-muted">
          A IA escreve 8 a 10 perguntas que os clientes deste negócio fazem, com as respostas — o tipo de conteúdo que as IAs mais citam. Usa os dados de
          “Dados estruturados” (tipo, zona, serviços, descrição).
        </p>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Perguntas frequentes">
          {items.map((it, i) => (
            <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={it.question}
                  aria-label={`Pergunta ${i + 1}`}
                  onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                  className="font-medium"
                />
                <Button size="sm" variant="ghost" aria-label={`Tirar a pergunta ${i + 1}`} onClick={() => change(items.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
              <Textarea
                rows={3}
                value={it.answer}
                aria-label={`Resposta ${i + 1}`}
                onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
              />
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={items.length ? 'outline' : 'primary'} onClick={() => void generate()} loading={action.isPending && !dirty}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> {items.length ? 'Escrever de novo com IA' : 'Escrever com IA'}
        </Button>
        {items.length ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => change([...items, { question: '', answer: '' }])}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Pergunta
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty} loading={action.isPending && dirty}>
              Guardar
            </Button>
          </>
        ) : null}
      </div>
      {valid.length ? (
        <>
          <CodeBox code={buildFaqHtml(valid)} label="HTML das perguntas (acordeão)" />
          <CodeBox code={jsonLdScript(buildFaqJsonLd(valid))} label="Código schema.org FAQPage (JSON-LD)" />
          <p className="text-xs text-muted">No Bricks: cola o HTML num elemento “Código” na página (ou usa o elemento Acordeão) e o JSON-LD no cabeçalho dessa página.</p>
        </>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------

function LlmsTab({ geo }: { geo: LeadGeo }) {
  const text = buildLlmsTxt(geo.business, geo.faq);
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'llms.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Um resumo do negócio em texto simples para as IAs, na raiz do site ({geo.business.url ? `${geo.business.url.replace(/\/$/, '')}/llms.txt` : 'https://o-site.pt/llms.txt'}). Usa os
        dados de “Dados estruturados” e as perguntas frequentes guardadas.
      </p>
      <CodeBox code={text} label="llms.txt">
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="h-3.5 w-3.5" aria-hidden /> Descarregar
        </Button>
      </CodeBox>
      <p className="text-xs text-muted">No WordPress: envia o ficheiro para a pasta principal do site (gestor de ficheiros da Hostinger ou FTP).</p>
    </div>
  );
}
