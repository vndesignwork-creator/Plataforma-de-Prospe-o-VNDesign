'use client';

/**
 * Novo lead mais depressa (ao lado de "Ler cartão de visita"):
 *  - Ditar ou escrever: diz ou cola "Restaurante O Quintal em Braga, falei com a
 *    Ana, 912…" e a IA preenche o formulário (revês antes de criar);
 *  - Escolher dos contactos: no telemóvel (Android/Chrome), puxa o nome, o
 *    telefone e o email de um contacto que já tens.
 */
import type { CardScanResult } from '@vndesign/core';
import { BookUser, Mic, Sparkles } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DictateButton, appendDictation } from '@/components/ui/dictate-button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

type PickedContact = { name?: string[]; email?: string[]; tel?: string[] };
type ContactsApi = { select: (props: string[], options?: { multiple?: boolean }) => Promise<PickedContact[]> };
const contactsApi = () => (typeof navigator !== 'undefined' ? (navigator as Navigator & { contacts?: ContactsApi }).contacts : undefined);
const hasContactPicker = () => typeof window !== 'undefined' && 'ContactsManager' in window && !!contactsApi()?.select;

const empty: Omit<CardScanResult, 'model'> = {
  company_name: null,
  contact_name: null,
  email: null,
  phone: null,
  website: null,
  city: null,
  address: null,
  notes: null,
};

/** `bare`: só os botões (sem a caixa e a explicação). */
export function LeadQuickFill({ onResult, bare }: { onResult: (data: CardScanResult) => void; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  const picker = useSyncExternalStore(() => () => {}, hasContactPicker, () => false);

  async function pickContact() {
    try {
      const [c] = await contactsApi()!.select(['name', 'email', 'tel'], { multiple: false });
      if (!c) return;
      onResult({
        ...empty,
        contact_name: c.name?.[0]?.trim() || null,
        email: c.email?.[0]?.trim().toLowerCase() || null,
        phone: c.tel?.[0]?.trim() || null,
        model: 'contactos',
      });
      toast.success('Contacto escolhido: falta o nome da empresa.');
    } catch (error) {
      // Fechar a lista sem escolher não é um erro.
      if (error instanceof Error && error.name !== 'AbortError' && error.name !== 'InvalidStateError') toast.error('Não foi possível abrir os contactos.');
    }
  }

  const Wrapper = bare ? 'span' : 'div';
  return (
    <Wrapper className={bare ? 'contents' : 'flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm'}>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Mic className="h-4 w-4 text-accent-text" aria-hidden /> Ditar ou escrever
      </Button>
      {picker ? (
        <Button type="button" size="sm" variant="outline" onClick={() => void pickContact()}>
          <BookUser className="h-4 w-4 text-accent-text" aria-hidden /> Escolher dos contactos
        </Button>
      ) : null}
      {bare ? null : (
        <span className="text-muted">Descreve o lead por palavras tuas: a IA preenche a empresa, o contacto, o telefone, o email e as notas.</span>
      )}
      {open ? (
        <TextFillDialog
          onClose={() => setOpen(false)}
          onResult={(data) => {
            onResult(data);
            setOpen(false);
          }}
        />
      ) : null}
    </Wrapper>
  );
}

function TextFillDialog({ onClose, onResult }: { onClose: () => void; onResult: (data: CardScanResult) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function fill() {
    setBusy(true);
    try {
      const { data } = await api<{ data: CardScanResult }>('/leads/from-text', { method: 'POST', body: { text: text.trim() } });
      onResult(data);
      toast.success('Formulário preenchido: revê os dados antes de criar o lead.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Ditar ou escrever o lead"
      description="Diz (ou cola) o que sabes do negócio. A IA preenche os campos vazios; nada é gravado até carregares em Criar lead."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void fill()} loading={busy} disabled={text.trim().length < 5}>
            <Sparkles className="h-4 w-4" aria-hidden /> Preencher
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="lead-text" className="text-sm font-medium">
          O que sabes do lead
        </label>
        <Textarea
          id="lead-text"
          rows={5}
          maxLength={4000}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex.: Restaurante O Quintal em Braga, falei com a Ana, telefone 912 345 678, querem um site novo com reservas."
        />
        <DictateButton size="sm" onText={(spoken) => setText((current) => appendDictation(current, spoken))} className="self-start" />
      </div>
    </Dialog>
  );
}
