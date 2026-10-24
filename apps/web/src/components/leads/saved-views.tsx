'use client';

/**
 * Filtros guardados na lista de leads ("Restaurantes em Lisboa sem site"):
 * guardar os filtros atuais com um nome, voltar a eles com um toque e apagar.
 * Ficam na conta de cada pessoa (preferência "leads.views") e aparecem também
 * na pesquisa rápida (Ctrl+K).
 */
import { SAVED_VIEWS_PREFERENCE, upsertView, viewQuery, type SavedView } from '@vndesign/core';
import { Bookmark, BookmarkPlus, Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { usePreference, useSetPreference } from '@/lib/queries';

export function useSavedViews() {
  const { data } = usePreference<SavedView[]>(SAVED_VIEWS_PREFERENCE);
  return Array.isArray(data) ? data : [];
}

export function SavedViewsMenu({ params, onApply }: { params: URLSearchParams; onApply: (query: string) => void }) {
  const views = useSavedViews();
  const save = useSetPreference<SavedView[]>(SAVED_VIEWS_PREFERENCE);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const current = viewQuery(params);
  const active = views.find((v) => v.query === current);

  function store() {
    const clean = name.trim();
    if (!clean) return;
    save.mutate(upsertView(views, clean, current, crypto.randomUUID()), {
      onSuccess: () => toast.success(`Filtros guardados como “${clean}”.`),
      onError: () => toast.error('Não foi possível guardar.'),
    });
    setNaming(false);
  }

  function remove(view: SavedView) {
    save.mutate(
      views.filter((v) => v.id !== view.id),
      { onSuccess: () => toast.success(`“${view.name}” apagado.`) },
    );
  }

  return (
    <>
      <DropdownRoot>
        <DropdownTrigger className={buttonClasses(active ? 'secondary' : 'outline', 'md', 'max-sm:w-10 max-sm:px-0')} aria-label="Filtros guardados">
          <Bookmark className="h-4 w-4" aria-hidden />
          <span className="hidden max-w-40 truncate sm:inline">{active ? active.name : 'Guardados'}</span>
        </DropdownTrigger>
        <DropdownContent className="max-h-96 overflow-y-auto">
          <DropdownLabel>Filtros guardados</DropdownLabel>
          {views.length ? (
            views.map((v) => (
              <DropdownItem key={v.id} onSelect={() => onApply(v.query)}>
                {v.id === active?.id ? <Check className="h-4 w-4 text-accent-text" aria-hidden /> : <Bookmark className="h-4 w-4 text-muted" aria-hidden />}
                {v.name}
              </DropdownItem>
            ))
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted">Ainda não guardaste nenhum.</p>
          )}
          <DropdownSeparator />
          <DropdownItem
            disabled={!current || !!active}
            onSelect={() => {
              setName('');
              setNaming(true);
            }}
          >
            <BookmarkPlus className="h-4 w-4 text-muted" aria-hidden />
            Guardar estes filtros…
          </DropdownItem>
          {views.length ? (
            <>
              <DropdownSeparator />
              <DropdownLabel>Apagar</DropdownLabel>
              {views.map((v) => (
                <DropdownItem key={v.id} onSelect={() => remove(v)}>
                  <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                  Apagar “{v.name}”
                </DropdownItem>
              ))}
            </>
          ) : null}
        </DropdownContent>
      </DropdownRoot>
      {naming ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setNaming(false) : undefined)}
          title="Guardar estes filtros"
          description="Voltas a eles com um toque em “Guardados” (ou no Ctrl+K)."
          className="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setNaming(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="save-view" disabled={!name.trim()}>
                Guardar
              </Button>
            </>
          }
        >
          <form
            id="save-view"
            onSubmit={(e) => {
              e.preventDefault();
              store();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Restaurantes em Lisboa sem site" aria-label="Nome" />
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
