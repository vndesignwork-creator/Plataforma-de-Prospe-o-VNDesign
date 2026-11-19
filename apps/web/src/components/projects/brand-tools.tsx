'use client';

/**
 * Ferramentas do kit da marca: tirar as cores do logótipo (no browser, sem IA), o manual de marca
 * em PDF, "Descarregar tudo" (ZIP) e códigos QR com as cores e o logótipo do cliente.
 */
import {
  QR_KINDS,
  QR_KIND_LABELS,
  extractPalette,
  qrFileName,
  qrPayload,
  type BrandKit,
  type Lead,
  type QrKind,
} from '@vndesign/core';
import { Check, Download, FileText, Palette, QrCode, Upload } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useBrandKitAction } from '@/lib/queries';
import { ClientSignatureButton } from './client-signature';

/** Ficheiros do kit que o browser consegue desenhar (para as cores e o logótipo do QR). */
const isImage = (f: BrandKit['files'][number]) => /^image\/(png|jpe?g|webp|svg\+xml|gif)$/i.test(f.type) || /\.(png|jpe?g|webp|svg|gif)$/i.test(f.name);
const contentUrl = (f: BrandKit['files'][number]) => `${f.url}/content`;

/** Carrega uma imagem (do kit ou do computador) já pronta a desenhar num canvas. */
async function loadImage(source: string | File): Promise<HTMLImageElement> {
  const blob = typeof source === 'string' ? await fetch(source, { credentials: 'same-origin' }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Não foi possível abrir o ficheiro.')))) : source;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // O <img> já tem os píxeis; o endereço temporário pode sair.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function paletteOf(img: HTMLImageElement): string[] {
  const max = 400;
  const scale = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
  const w = Math.max(1, Math.round((img.naturalWidth || max) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || max) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return [];
  g.drawImage(img, 0, 0, w, h);
  return extractPalette(g.getImageData(0, 0, w, h).data);
}

export function BrandToolsBar({ lead, kit }: { lead: Lead; kit: BrandKit }) {
  const [palette, setPalette] = useState(false);
  const [qr, setQr] = useState(false);
  const hasContent = kit.files.length > 0 || kit.colors.length > 0 || kit.fonts.length > 0;
  const base = `/api/v1/leads/${lead.id}/brand-kit`;
  return (
    <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3" role="group" aria-label="Ferramentas do kit">
      {!lead.anonymized_at ? (
        <Button size="sm" variant="outline" onClick={() => setPalette(true)}>
          <Palette className="h-3.5 w-3.5" aria-hidden /> Cores do logótipo
        </Button>
      ) : null}
      {!lead.anonymized_at ? <ClientSignatureButton lead={lead} kit={kit} /> : null}
      {hasContent ? (
        <a href={`${base}/manual`} target="_blank" rel="noopener" className={buttonClasses('outline', 'sm')}>
          <FileText className="h-3.5 w-3.5" aria-hidden /> Manual de marca (PDF)
        </a>
      ) : null}
      {hasContent ? (
        <a href={`${base}/zip`} className={buttonClasses('outline', 'sm')} download>
          <Download className="h-3.5 w-3.5" aria-hidden /> Descarregar tudo (ZIP)
        </a>
      ) : null}
      <Button size="sm" variant="outline" onClick={() => setQr(true)}>
        <QrCode className="h-3.5 w-3.5" aria-hidden /> Código QR
      </Button>
      {palette ? <PaletteDialog lead={lead} kit={kit} onClose={() => setPalette(false)} /> : null}
      {qr ? <QrDialog lead={lead} kit={kit} onClose={() => setQr(false)} /> : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Cores do logótipo
// -----------------------------------------------------------------------------

function PaletteDialog({ lead, kit, onClose }: { lead: Lead; kit: BrandKit; onClose: () => void }) {
  const action = useBrandKitAction(lead.id);
  const images = kit.files.map((f, i) => ({ f, i })).filter(({ f }) => isImage(f));
  const [found, setFound] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const existing = new Set(kit.colors.map((c) => c.hex.toLowerCase()));

  async function read(source: string | File) {
    setLoading(true);
    try {
      const colors = paletteOf(await loadImage(source)).filter((hex) => !existing.has(hex));
      setFound(colors);
      setChosen(new Set(colors));
      if (!colors.length) toast('Não encontrei cores novas nesta imagem.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler a imagem.');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const add = (found ?? []).filter((hex) => chosen.has(hex)).map((hex) => ({ name: '', hex }));
    const colors = [...kit.colors, ...add].slice(0, 24);
    try {
      await action.mutateAsync({ body: { colors } });
      toast.success(add.length === 1 ? '1 cor juntada ao kit.' : `${add.length} cores juntadas ao kit.`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Cores do logótipo"
      description="Escolhe o logótipo: a plataforma lê as cores principais (no teu browser, sem IA). Depois dás-lhes nome em Editar."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!chosen.size} loading={action.isPending}>
            Juntar {chosen.size || ''} ao kit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {images.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Imagens do kit">
            {images.map(({ f, i }) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => void read(contentUrl(f))}
                  className="flex w-full flex-col items-center gap-1 rounded-lg border border-border p-2 text-xs hover:border-border-strong"
                  aria-label={`Ler as cores de ${f.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ficheiro privado servido pela API */}
                  <img src={f.url} alt="" className="h-12 w-full object-contain" />
                  <span className="w-full truncate">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Ainda não há imagens no kit: escolhe um ficheiro do computador.</p>
        )}
        <label className={buttonClasses('outline', 'sm', 'cursor-pointer self-start')}>
          <Upload className="h-3.5 w-3.5" aria-hidden /> Escolher do computador
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
        </label>
        {loading ? <p className="text-sm text-muted">A ler as cores…</p> : null}
        {found?.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Cores encontradas">
            {found.map((hex) => {
              const on = chosen.has(hex);
              return (
                <li key={hex}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen((s) => (s.has(hex) ? new Set([...s].filter((x) => x !== hex)) : new Set([...s, hex])))}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1 font-mono text-xs uppercase ${on ? 'border-accent' : 'border-border opacity-60'}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border" style={{ backgroundColor: hex }} aria-hidden>
                      {on ? <Check className="h-3.5 w-3.5 text-white mix-blend-difference" /> : null}
                    </span>
                    {hex}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Códigos QR
// -----------------------------------------------------------------------------

const QR_SIZE = 1024;

function QrDialog({ lead, kit, onClose }: { lead: Lead; kit: BrandKit; onClose: () => void }) {
  const action = useBrandKitAction(lead.id);
  const images = kit.files.map((f, i) => ({ f, i })).filter(({ f }) => isImage(f));
  const [kind, setKind] = useState<QrKind>('url');
  const [value, setValue] = useState(lead.website ?? '');
  const [message, setMessage] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [dark, setDark] = useState(kit.colors[0]?.hex ?? '#141414');
  const [logoIndex, setLogoIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<{ index: number; img: HTMLImageElement } | null>(null);
  const logo = loaded && loaded.index === logoIndex ? loaded.img : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const payload = qrPayload({ kind, value, message, ssid, password, security });
  const text = 'text' in payload ? payload.text : null;

  // O logótipo escolhido (do kit), já carregado para desenhar.
  useEffect(() => {
    let alive = true;
    const f = logoIndex === null ? null : kit.files[logoIndex];
    if (!f || logoIndex === null) return;
    loadImage(contentUrl(f))
      .then((img) => alive && setLoaded({ index: logoIndex, img }))
      .catch(() => alive && toast.error('Não foi possível abrir o logótipo.'));
    return () => {
      alive = false;
    };
  }, [logoIndex, kit.files]);

  // Pré-visualização (e o PNG): o código, e o logótipo num quadrado branco ao centro.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !text) return;
    void QRCode.toCanvas(canvas, text, { width: QR_SIZE, margin: 2, errorCorrectionLevel: logo ? 'H' : 'M', color: { dark, light: '#ffffff' } }).then(() => {
      if (!logo) return;
      const g = canvas.getContext('2d');
      if (!g) return;
      const box = Math.round(canvas.width * 0.22);
      const x = (canvas.width - box) / 2;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.roundRect(x, x, box, box, box * 0.12);
      g.fill();
      const pad = box * 0.1;
      const ratio = Math.min((box - pad * 2) / logo.naturalWidth, (box - pad * 2) / logo.naturalHeight);
      const w = logo.naturalWidth * ratio;
      const h = logo.naturalHeight * ratio;
      g.drawImage(logo, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    });
  }, [text, dark, logo]);

  function pngBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => canvasRef.current?.toBlob((b) => (b ? resolve(b) : reject(new Error('Sem imagem.'))), 'image/png'));
  }

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function svg(): Promise<string> {
    let out = await QRCode.toString(text!, { type: 'svg', margin: 2, errorCorrectionLevel: logo ? 'H' : 'M', color: { dark, light: '#ffffff' } });
    if (logo && canvasRef.current) {
      // O logótipo vai embutido (PNG) no centro, como na pré-visualização.
      const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(out)?.[1] ?? 0);
      if (size) {
        const box = size * 0.22;
        const x = (size - box) / 2;
        const mini = document.createElement('canvas');
        mini.width = 256;
        mini.height = 256;
        const g = mini.getContext('2d')!;
        const ratio = Math.min(256 / logo.naturalWidth, 256 / logo.naturalHeight);
        g.drawImage(logo, (256 - logo.naturalWidth * ratio) / 2, (256 - logo.naturalHeight * ratio) / 2, logo.naturalWidth * ratio, logo.naturalHeight * ratio);
        const pad = box * 0.1;
        out = out.replace(
          '</svg>',
          `<rect x="${x}" y="${x}" width="${box}" height="${box}" rx="${box * 0.12}" fill="#ffffff"/><image x="${x + pad}" y="${x + pad}" width="${box - pad * 2}" height="${box - pad * 2}" href="${mini.toDataURL('image/png')}" preserveAspectRatio="xMidYMid meet"/></svg>`,
        );
      }
    }
    return out;
  }

  async function addToKit() {
    try {
      const blob = await pngBlob();
      await action.mutateAsync({ files: [new File([blob], qrFileName(kind, lead.company_name, 'png'), { type: 'image/png' })] });
      toast.success('Código QR guardado no kit.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const colorChoices = [...new Set([...kit.colors.map((c) => c.hex.toLowerCase()), '#141414'])];
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Código QR"
      description="Para flyers, montras e mesas: com a cor e o logótipo do cliente. Experimenta sempre com a câmara do telemóvel antes de imprimir."
      className="sm:max-w-2xl"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div className="flex flex-col gap-3">
          <Field label="Para onde aponta">
            <Select value={kind} onChange={(e) => setKind(e.target.value as QrKind)}>
              {QR_KINDS.map((k) => (
                <option key={k} value={k}>
                  {QR_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          {kind === 'wifi' ? (
            <>
              <Field label="Nome da rede">
                <Input value={ssid} onChange={(e) => setSsid(e.target.value)} />
              </Field>
              <Field label="Segurança">
                <Select value={security} onChange={(e) => setSecurity(e.target.value as typeof security)}>
                  <option value="WPA">WPA/WPA2 (a mais comum)</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Sem palavra-passe</option>
                </Select>
              </Field>
              {security !== 'nopass' ? (
                <Field label="Palavra-passe da rede">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              ) : null}
            </>
          ) : (
            <Field label={kind === 'whatsapp' ? 'Telefone' : kind === 'text' ? 'Texto' : kind === 'review' ? 'Link para avaliação no Google' : 'Endereço'}>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode={kind === 'whatsapp' ? 'tel' : kind === 'text' ? 'text' : 'url'}
                placeholder={kind === 'whatsapp' ? '912 345 678' : kind === 'review' ? 'https://g.page/r/…/review' : kind === 'url' ? 'https://…' : ''}
              />
            </Field>
          )}
          {kind === 'whatsapp' ? (
            <Field label="Mensagem já escrita (opcional)">
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Olá! Queria fazer uma reserva." />
            </Field>
          ) : null}
          <Field label="Cor do código">
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Cor do código">
              {colorChoices.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={dark.toLowerCase() === hex}
                  aria-label={`Cor ${hex}`}
                  onClick={() => setDark(hex)}
                  className={`h-8 w-8 rounded-md border-2 ${dark.toLowerCase() === hex ? 'border-accent' : 'border-border'}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <input type="color" aria-label="Outra cor" value={/^#[0-9a-f]{6}$/i.test(dark) ? dark : '#141414'} onChange={(e) => setDark(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent" />
            </div>
          </Field>
          {images.length ? (
            <Field label="Logótipo ao centro">
              <Select value={logoIndex === null ? '' : String(logoIndex)} onChange={(e) => setLogoIndex(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">Sem logótipo</option>
                {images.map(({ f, i }) => (
                  <option key={i} value={i}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-2">
          {text ? (
            <canvas ref={canvasRef} className="aspect-square w-full max-w-56 rounded-lg border border-border bg-white" aria-label="Pré-visualização do código QR" role="img" />
          ) : (
            <p className="flex aspect-square w-full max-w-56 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">{'error' in payload ? payload.error : ''}</p>
          )}
          {/* Contraste fraco: um leitor pode não conseguir ler. */}
          {text ? <p className="text-center text-xs text-muted">{logo ? 'Com logótipo: o código fica mais robusto (correção de erros alta).' : 'Prefere cores escuras sobre o fundo branco.'}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
        <Button variant="outline" disabled={!text} onClick={() => void svg().then((s) => save(new Blob([s], { type: 'image/svg+xml' }), qrFileName(kind, lead.company_name, 'svg')))}>
          Descarregar SVG
        </Button>
        <Button variant="outline" disabled={!text} onClick={() => void pngBlob().then((b) => save(b, qrFileName(kind, lead.company_name, 'png')))}>
          Descarregar PNG
        </Button>
        {!lead.anonymized_at ? (
          <Button disabled={!text} loading={action.isPending} onClick={() => void addToKit()}>
            Guardar no kit
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
