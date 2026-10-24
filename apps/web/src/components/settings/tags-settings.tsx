'use client';

/**
 * Definições → Etiquetas: as etiquetas usadas nos leads, com quantos leads têm
 * cada uma. Renomear muda-a em todos os leads; para um nome que já existe junta
 * as duas ("feira março" + "feira de março"); apagar tira-a de todos.
 */
import { normalizeTags, type LeadTagCount } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Merge, Pencil, Tag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useLeadTags } from '@/components/leads/tags';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function TagsSettings() {
  const { data: tags, isLoading } = useLeadTags();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LeadTagCount | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<LeadTagCount | null>(null);
  const [busy, setBusy] = useState(false);

  const target = normalizeTags([name])[0] ?? '';
  // Para um nome que já existe (sem contar maiúsculas/acentos), é juntar.
  const mergeWith = editing && target ? (tags ?? []).find((t) => t.tag !== editing.tag && fold(t.tag) === fold(target)) : undefined;

  async function rename(from: string, to: string | null) {
    setBusy(true);
    try {
      const { data } = await api<{ data: { affected: number } }>('/leads/tags', { method: 'PATCH', body: { from, to } });
      const n = data.affected === 1 ? '1 lead' : `${data.affected} leads`;
      toast.success(to === null ? `Etiqueta “${from}” apagada (${n}).` : mergeWith ? `“${from}” juntada a “${mergeWith.tag}” (${n}).` : `Etiqueta renomeada para “${to}” (${n}).`);
      setEditing(null);
      setDeleting(null);
      for (const key of ['lead-tags', 'leads', 'lead', 'board']) void qc.invalidateQueries({ queryKey: [key] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Etiquetas"
        description="As etiquetas dos leads (põem-se na ficha ou em vários de uma vez na lista). Renomear muda-a em todos; para um nome que já existe, junta as duas."
      />
      {isLoading ? (
        <Skeleton className="m-4 h-32" />
      ) : !tags?.length ? (
        <p className="p-4 text-sm text-muted">Ainda não há etiquetas. Põe a primeira na ficha de um lead, na linha “Etiquetas”.</p>
      ) : (
        <ul aria-label="Etiquetas" className="divide-y divide-border">
          {tags.map((t) => (
            <li key={t.tag} className="flex items-center gap-3 px-4 py-2.5">
              <Tag className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <Link href={`/leads?etiqueta=${encodeURIComponent(t.tag)}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {t.tag}
              </Link>
              <span className="text-sm text-muted tabular">
                {t.count} lead{t.count === 1 ? '' : 's'}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Renomear ${t.tag}`}
                title="Renomear ou juntar"
                onClick={() => {
                  setName(t.tag);
                  setEditing(t);
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" className="text-danger" aria-label={`Apagar ${t.tag}`} title="Apagar" onClick={() => setDeleting(t)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setEditing(null) : undefined)}
          title={`Renomear “${editing.tag}”`}
          description={`Muda em ${editing.count === 1 ? '1 lead' : `${editing.count} leads`}.`}
          className="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" form="rename-tag" loading={busy} disabled={!target || target === editing.tag}>
                {mergeWith ? (
                  <>
                    <Merge className="h-4 w-4" aria-hidden /> Juntar
                  </>
                ) : (
                  'Renomear'
                )}
              </Button>
            </>
          }
        >
          <form
            id="rename-tag"
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (target && target !== editing.tag) void rename(editing.tag, mergeWith?.tag ?? target);
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="Novo nome" />
            {mergeWith ? (
              <p className="text-sm text-muted" role="status">
                Já existe “{mergeWith.tag}” ({mergeWith.count} lead{mergeWith.count === 1 ? '' : 's'}): as duas passam a ser uma só.
              </p>
            ) : null}
          </form>
        </Dialog>
      ) : null}

      {deleting ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setDeleting(null) : undefined)}
          title={`Apagar “${deleting.tag}”?`}
          description={`Sai de ${deleting.count === 1 ? '1 lead' : `${deleting.count} leads`}. Os leads ficam como estão.`}
          className="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => void rename(deleting.tag, null)} loading={busy}>
                Apagar etiqueta
              </Button>
            </>
          }
        />
      ) : null}
    </Card>
  );
}
