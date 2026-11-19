'use client';

/**
 * Assinatura de email para o cliente, feita a partir do kit da marca (logótipo
 * e cor): vê-se como vai ficar e copia-se pronta a colar no Gmail ou no
 * Outlook (ou guarda-se o ficheiro .html para enviar ao cliente).
 */
import {
  CLIENT_SIGNATURE_LAYOUTS,
  CLIENT_SIGNATURE_LAYOUT_LABELS,
  clientSignatureFile,
  clientSignatureHtml,
  clientSignatureText,
  type BrandKit,
  type ClientSignatureLayout,
  type Lead,
} from '@vndesign/core';
import { Copy, Download, PenLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';

/** Ficheiros do kit que servem de logótipo (o SVG não entra: os emails não o mostram). */
const isLogo = (f: BrandKit['files'][number]) => /^image\/(png|jpe?g|gif)$/i.test(f.type) || /\.(png|jpe?g|gif)$/i.test(f.name);

/** Lê a imagem do kit e devolve-a pequena, em data: (para colar no email com a imagem lá dentro). */
async function logoDataUrl(url: string, width: number): Promise<string> {
  const blob = await fetch(url, { credentials: 'same-origin' }).then((r) => {
    if (!r.ok) throw new Error('Não foi possível abrir o logótipo.');
    return r.blob();
  });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;
    await img.decode();
    const scale = width / (img.naturalWidth || width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * 2));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || width) * scale * 2));
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Não foi possível preparar o logótipo.');
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}

export function ClientSignatureDialog({ lead, kit, onClose }: { lead: Lead; kit: BrandKit; onClose: () => void }) {
  const logos = kit.files.filter(isLogo);
  const [form, setForm] = useState({
    name: lead.contact_name ?? '',
    role: '',
    company: lead.company_name,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    website: lead.website ?? '',
    address: [lead.address, lead.city].filter(Boolean).join(', '),
    color: kit.colors[0]?.hex ?? '#141414',
    logoIndex: logos.length ? kit.files.indexOf(logos[0]!) : -1,
    layout: 'lado' as ClientSignatureLayout,
    width: 140,
  });
  // O logótipo já lido (guarda-se com a escolha e o tamanho, para não o ler outra vez).
  const [loaded, setLoaded] = useState<{ index: number; width: number; data: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const file = form.logoIndex >= 0 ? kit.files[form.logoIndex] : null;
  const logo = loaded && loaded.index === form.logoIndex && loaded.width === form.width ? loaded.data : null;

  // Carrega (ou troca) o logótipo escolhido, já pequeno.
  useEffect(() => {
    if (!file) return;
    let alive = true;
    const timer = setTimeout(() => alive && setLoading(true), 150);
    logoDataUrl(`${file.url}/content`, form.width)
      .then((data) => {
        if (alive) setLoaded({ index: form.logoIndex, width: form.width, data });
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [file, form.logoIndex, form.width]);

  const input = { ...form, logo: logo ? { src: logo, width: form.width } : null };
  const html = clientSignatureHtml(input);

  async function copy() {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([clientSignatureText(input)], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      toast.success('Assinatura copiada. Cola no Gmail ou no Outlook do cliente.');
    } catch {
      try {
        await navigator.clipboard.writeText(html);
        toast.success('HTML da assinatura copiado.');
      } catch {
        toast.error('Não foi possível copiar.');
      }
    }
  }

  function download() {
    const blob = new Blob([clientSignatureFile(input)], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `assinatura-${lead.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cliente'}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Assinatura de email do cliente"
      description="Com o logótipo e a cor do kit. Copia e cola no Gmail (Definições → Assinatura) ou no Outlook."
      className="sm:max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={download}>
            <Download className="h-4 w-4" aria-hidden /> Guardar .html
          </Button>
          <Button onClick={() => void copy()} loading={loading}>
            <Copy className="h-4 w-4" aria-hidden /> Copiar assinatura
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <Input value={form.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Ana Ribeiro" />
          </Field>
          <Field label="Cargo">
            <Input value={form.role} maxLength={120} onChange={(e) => set({ role: e.target.value })} placeholder="Ex.: Gerente" />
          </Field>
          <Field label="Empresa">
            <Input value={form.company} maxLength={200} onChange={(e) => set({ company: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} maxLength={40} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={form.email} maxLength={254} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Site">
            <Input value={form.website} maxLength={200} onChange={(e) => set({ website: e.target.value })} />
          </Field>
          <Field label="Morada" className="sm:col-span-2">
            <Input value={form.address} maxLength={200} onChange={(e) => set({ address: e.target.value })} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Logótipo">
            <Select
              value={String(form.logoIndex)}
              onChange={(e) => set({ logoIndex: Number(e.target.value) })}
              disabled={!logos.length}
            >
              <option value="-1">Sem logótipo</option>
              {kit.files.map((f, i) => (isLogo(f) ? <option key={i} value={i}>{f.name}</option> : null))}
            </Select>
          </Field>
          <Field label="Tamanho do logótipo">
            <Select value={String(form.width)} onChange={(e) => set({ width: Number(e.target.value) })}>
              {[100, 140, 180].map((w) => (
                <option key={w} value={w}>
                  {w === 100 ? 'Pequeno' : w === 140 ? 'Médio' : 'Grande'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Onde fica">
            <Select value={form.layout} onChange={(e) => set({ layout: e.target.value as ClientSignatureLayout })}>
              {CLIENT_SIGNATURE_LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {CLIENT_SIGNATURE_LAYOUT_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!logos.length ? <p className="text-xs text-muted">O kit ainda não tem um logótipo em PNG, JPG ou GIF (o SVG não aparece nos emails).</p> : null}

        <div>
          <p className="mb-1 text-sm font-medium">Como vai ficar</p>
          {/* Fundo branco: é assim que aparece no email. */}
          <div className="overflow-x-auto rounded-lg border border-border bg-white p-4" data-testid="pre-visualizacao-assinatura">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Botão na barra de ferramentas do kit. */
export function ClientSignatureButton({ lead, kit }: { lead: Lead; kit: BrandKit }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PenLine className="h-3.5 w-3.5" aria-hidden /> Assinatura de email
      </Button>
      {open ? <ClientSignatureDialog lead={lead} kit={kit} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
