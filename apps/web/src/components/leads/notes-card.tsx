'use client';

import type { Lead } from '@vndesign/core';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { Linkified } from '@/lib/linkify';
import { useUpdateLead } from '@/lib/queries';
import { MeetingNotesButton } from './meeting-notes';

/**
 * Notas do lead, editáveis no próprio cartão (sem abrir o formulário "Editar").
 * Também tem as "Notas com IA" (resumo de uma reunião ou chamada) e recolhe-se.
 */
export function NotesCard({ lead }: { lead: Lead }) {
  const update = useUpdateLead(lead.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lead.notes ?? '');
  const readOnly = Boolean(lead.anonymized_at);
  const [collapsed, setCollapsed] = useCollapsed('notas');
  const hidden = collapsed && !editing;

  function start() {
    setDraft(lead.notes ?? '');
    setEditing(true);
  }

  async function save() {
    try {
      await update.mutateAsync({ notes: draft.trim() || null });
      setEditing(false);
      toast.success('Notas guardadas.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Notas"
        // Recolhido: o início das notas fica à vista.
        description={hidden ? (lead.notes ? (lead.notes.length > 90 ? `${lead.notes.slice(0, 90).trimEnd()}…` : lead.notes) : 'Sem notas.') : undefined}
        className={hidden ? 'border-b-0' : undefined}
        actions={
          editing ? null : (
            <>
              <MeetingNotesButton lead={lead} />
              {!readOnly ? (
                <Button size="sm" variant="ghost" onClick={start} aria-label="Editar notas">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Editar
                </Button>
              ) : null}
              <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label="Notas" />
            </>
          )
        }
      />
      {hidden ? null : editing ? (
        <form
          className="flex flex-col gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            // Ctrl/Cmd + Enter guarda.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void save();
            }
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            maxLength={10_000}
            autoFocus
            aria-label="Notas do lead"
            placeholder="Contexto, morada, quem atendeu, o que ficou combinado…"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={update.isPending}>
              Guardar notas
            </Button>
          </div>
        </form>
      ) : lead.notes ? (
        <p className="p-4 text-sm break-words whitespace-pre-line">
          <Linkified text={lead.notes} />
        </p>
      ) : (
        <p className="p-4 text-center text-sm text-muted">Sem notas.</p>
      )}
    </Card>
  );
}
