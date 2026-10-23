'use client';

/**
 * Etiquetas livres dos leads ("feira de março", "urgente"…): chips na lista,
 * no Kanban e na ficha, editor na ficha (com sugestões das já usadas) e as
 * opções do filtro.
 */
import { normalizeTags, type Lead, type LeadTagCount } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { useUpdateLead } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Etiquetas usadas no workspace (mais usadas primeiro). */
export function useLeadTags(enabled = true) {
  return useQuery({
    queryKey: ['lead-tags'],
    queryFn: () => api<{ data: LeadTagCount[] }>('/leads/tags').then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

/** Opções do filtro "Etiqueta" (lista e Kanban). */
export function useTagFilterOptions() {
  const { data } = useLeadTags();
  return (data ?? []).map((t) => ({ value: t.tag, label: `${t.tag} (${t.count})`, icon: <Tag className="h-3.5 w-3.5 text-muted" aria-hidden /> }));
}

/** Chips pequenos (cada um leva à lista filtrada por essa etiqueta). */
export function TagChips({ tags, className, link = true }: { tags: readonly string[] | undefined; className?: string; link?: boolean }) {
  if (!tags?.length) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {tags.map((tag) => {
        const chip = (
          <>
            <Tag className="h-3 w-3" aria-hidden />
            {tag}
          </>
        );
        const cls = 'inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted';
        return link ? (
          <Link key={tag} href={`/leads?etiqueta=${encodeURIComponent(tag)}`} className={cn(cls, 'hover:text-fg')} title={`Leads com a etiqueta “${tag}”`}>
            {chip}
          </Link>
        ) : (
          <span key={tag} className={cls}>
            {chip}
          </span>
        );
      })}
    </span>
  );
}

/** Editor da ficha: tirar (×) e acrescentar (Enter ou vírgula), com as já usadas como sugestão. Grava logo. */
export function TagEditor({ lead }: { lead: Lead }) {
  const update = useUpdateLead(lead.id);
  const qc = useQueryClient();
  const { data: all } = useLeadTags();
  const listId = useId();
  const [text, setText] = useState('');
  const tags = lead.tags ?? [];

  async function save(next: string[]) {
    try {
      await update.mutateAsync({ tags: next });
      void qc.invalidateQueries({ queryKey: ['lead-tags'] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function add(value: string) {
    const next = normalizeTags([...tags, ...value.split(',')]);
    setText('');
    if (next.length === tags.length) return;
    if (tags.length >= 10) {
      toast.error('No máximo 10 etiquetas.');
      return;
    }
    void save(next);
  }

  const suggestions = (all ?? []).map((t) => t.tag).filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-surface-3 py-0.5 pr-1 pl-2 text-xs font-medium">
          <Link href={`/leads?etiqueta=${encodeURIComponent(tag)}`} className="hover:underline">
            {tag}
          </Link>
          <button
            type="button"
            onClick={() => void save(tags.filter((t) => t !== tag))}
            className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
            aria-label={`Tirar a etiqueta ${tag}`}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      {tags.length < 10 ? (
        <span className="inline-flex items-center">
          <Plus className="mr-1 h-3.5 w-3.5 text-muted" aria-hidden />
          <input
            value={text}
            list={listId}
            maxLength={30}
            onChange={(e) => {
              // Vírgula = etiqueta seguinte.
              if (e.target.value.includes(',')) add(e.target.value);
              else setText(e.target.value);
            }}
            onKeyDown={(e) => {
              // Enter grava (mesmo com a lista de sugestões aberta).
              if (e.key === 'Enter') {
                e.preventDefault();
                if (text.trim()) add(text);
              }
            }}
            onBlur={() => text.trim() && add(text)}
            placeholder={tags.length ? 'Outra etiqueta' : 'Acrescentar etiqueta'}
            aria-label="Nova etiqueta"
            className="h-7 w-36 rounded-md border border-transparent bg-transparent px-1 text-sm outline-none placeholder:text-muted focus:border-border"
          />
          <datalist id={listId}>
            {suggestions.slice(0, 30).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </span>
      ) : null}
    </div>
  );
}
