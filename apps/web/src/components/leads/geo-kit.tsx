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
  formatDateTime,
  googleComparison,
  googleMapsSearchUrl,
  googleProfileUnconfirmed,
  jsonLdScript,
  type GeoBusiness,
  type GeoFaqItem,
  type GoogleProfile,
  type Lead,
  type LeadGeo,
  type SchemaBusinessType,
} from '@vndesign/core';
import { Code2, Copy, Download, ExternalLink, FileText, MapPin, MessageCircleQuestion, Plus, Sparkles, Star, Trash2, Wand2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

function Stars({ p, unconfirmed }: { p: GoogleProfile; unconfirmed: boolean }) {
  // A pesquisa da IA não vê o Google Maps: não encontrar não prova que não exista.
  if (unconfirmed) return <span className="text-sm text-warning">Não confirmado</span>;
  if (!p.found) return <span className="text-sm text-danger">Sem perfil no Google</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular">
      <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
      {p.rating !== null ? p.rating.toLocaleString('pt-PT', { maximumFractionDigits: 1 }) : '—'}
      <span className="text-muted">· {p.reviews ?? 0} avaliações</span>
    </span>
  );
}

function GoogleTab({ leadId, geo, city }: { leadId: string; geo: LeadGeo; city: string | null }) {
  const action = useLeadGeoAction(leadId);
  const g = geo.google;
  const sentence = g ? googleComparison(g) : null;

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
            {[g.lead, ...g.competitors].map((p, i) => (
              <li key={`${p.name}-${i}`} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', i === 0 && 'bg-surface-2')}>
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {p.name} {i === 0 ? <Badge tone="accent">este lead</Badge> : null}
                </span>
                <Stars p={p} unconfirmed={googleProfileUnconfirmed(g, p)} />
                <a
                  href={p.maps_url ?? googleMapsSearchUrl(p.name, city)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-0.5 text-xs text-accent-text hover:underline"
                  aria-label={`${p.maps_url ? 'Abrir' : 'Procurar'} ${p.name} no Google Maps`}
                >
                  {p.maps_url ? 'Maps' : 'Procurar no Maps'} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          {g.source !== 'places' && !g.lead.found ? (
            <p className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
              A pesquisa da IA não encontrou o perfil, mas ela não vê o Google Maps — confirma em “Procurar no Maps”. Com a chave da Google
              Places API (GOOGLE_PLACES_API_KEY) a nota e as avaliações vêm diretamente do Google.
            </p>
          ) : null}
          {sentence ? (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <p className="flex-1">{sentence}</p>
              <Button size="sm" variant="ghost" onClick={() => void copy(sentence, 'Frase')} aria-label="Copiar a frase para o cliente">
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-muted">
            {formatDateTime(g.checked_at)} ·{' '}
            {g.source === 'places' ? 'Google Places (dados do Google)' : 'Pesquisa da IA: valores aproximados — confirma no Google Maps antes de mostrar ao cliente'}
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
